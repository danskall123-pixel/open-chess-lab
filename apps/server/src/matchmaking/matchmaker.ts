import { randomInt } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { QueueEntry, TimeControl } from '@open-chess-lab/shared';
import {
  DEFAULT_PAIRING_OPTIONS,
  DEFAULT_RATING,
  findPairs,
  isValidTimeControl,
  parseTimeControlKey,
  speedOf,
  timeControlKey,
} from '@open-chess-lab/shared';
import type { GameManager } from '../games/gameManager.js';
import { badRequest, forbidden } from '../http/errors.js';
import type { PlayerIdentity } from '../players.js';
import { canPlayRated } from '../players.js';
import type { RatingService } from '../ratings/ratingService.js';
import type { Hub, PresenceListener } from '../realtime/hub.js';
import type { Redis } from '../redis.js';

export interface QueuedPlayer extends QueueEntry {
  player: PlayerIdentity;
}

export interface QueueMembership {
  timeControl: TimeControl;
  rated: boolean;
}

const QUEUES_KEY = 'mm:queues';
const MEMBERSHIP_KEY = 'mm:members';
const TICK_INTERVAL_MS = 1000;

function queueKey(timeControl: TimeControl, rated: boolean): string {
  return `mm:queue:${timeControlKey(timeControl)}:${rated ? 'rated' : 'casual'}`;
}

function membershipOf(key: string): QueueMembership | null {
  const match = /^mm:queue:(\d+\+\d+):(rated|casual)$/.exec(key);
  const timeControl = match?.[1] ? parseTimeControlKey(match[1]) : null;
  return timeControl ? { timeControl, rated: match?.[2] === 'rated' } : null;
}

export interface MatchmakerDependencies {
  redis: Redis;
  games: GameManager;
  ratings: RatingService;
  hub: Hub;
  logger: FastifyBaseLogger;
  onGameStarted: (playerKeys: string[]) => Promise<void>;
}

export class Matchmaker implements PresenceListener {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(private readonly deps: MatchmakerDependencies) {
    deps.hub.addPresenceListener(this);
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async join(player: PlayerIdentity, timeControl: TimeControl, rated: boolean): Promise<void> {
    if (!isValidTimeControl(timeControl)) throw badRequest('That time control is not supported.');
    if (rated && !canPlayRated(player)) throw forbidden('Create an account to play rated games.');
    this.deps.games.assertAvailable(player);
    await this.leave(player.key);
    const rating = player.userId
      ? await this.deps.ratings.ratingOf(player.userId, speedOf(timeControl))
      : DEFAULT_RATING;
    const entry: QueuedPlayer = {
      id: player.key,
      rating: rating.rating,
      joinedAt: Date.now(),
      player,
    };
    const key = queueKey(timeControl, rated);
    await this.deps.redis
      .multi()
      .hset(key, player.key, JSON.stringify(entry))
      .hset(MEMBERSHIP_KEY, player.key, key)
      .sadd(QUEUES_KEY, key)
      .exec();
    this.deps.hub.sendToPlayer(player.key, { t: 'queue.status', queued: true, timeControl, rated });
  }

  async leave(playerKey: string): Promise<void> {
    const key = await this.deps.redis.hget(MEMBERSHIP_KEY, playerKey);
    if (!key) return;
    await this.deps.redis.multi().hdel(key, playerKey).hdel(MEMBERSHIP_KEY, playerKey).exec();
    this.deps.hub.sendToPlayer(playerKey, {
      t: 'queue.status',
      queued: false,
      timeControl: null,
      rated: false,
    });
  }

  async membership(playerKey: string): Promise<QueueMembership | null> {
    const key = await this.deps.redis.hget(MEMBERSHIP_KEY, playerKey);
    return key ? membershipOf(key) : null;
  }

  async clear(): Promise<void> {
    const keys = await this.deps.redis.smembers(QUEUES_KEY);
    await this.deps.redis.del(QUEUES_KEY, MEMBERSHIP_KEY, ...keys);
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const key of await this.deps.redis.smembers(QUEUES_KEY)) await this.pairQueue(key);
    } catch (error) {
      this.deps.logger.error({ err: error }, 'Matchmaking tick failed');
    } finally {
      this.ticking = false;
    }
  }

  onPresenceChange(playerKey: string): void {
    if (!this.deps.hub.isOnline(playerKey)) void this.leave(playerKey);
  }

  private async pairQueue(key: string): Promise<void> {
    const membership = membershipOf(key);
    if (!membership) return;
    const entries = Object.values(await this.deps.redis.hgetall(key)).map(
      (raw) => JSON.parse(raw) as QueuedPlayer,
    );
    if (entries.length === 0) {
      await this.deps.redis.srem(QUEUES_KEY, key);
      return;
    }
    for (const [first, second] of findPairs(entries, Date.now(), DEFAULT_PAIRING_OPTIONS)) {
      await this.startPairedGame(key, membership, first, second);
    }
  }

  private async startPairedGame(
    key: string,
    membership: QueueMembership,
    first: QueuedPlayer,
    second: QueuedPlayer,
  ): Promise<void> {
    const removed = await this.deps.redis.hdel(key, first.id, second.id);
    if (removed !== 2) return;
    await this.deps.redis.hdel(MEMBERSHIP_KEY, first.id, second.id);
    const firstIsWhite = randomInt(2) === 0;
    try {
      await this.deps.games.createGame({
        white: firstIsWhite ? first.player : second.player,
        black: firstIsWhite ? second.player : first.player,
        rated: membership.rated,
        timeControl: membership.timeControl,
        source: 'queue',
      });
      await this.deps.onGameStarted([first.id, second.id]);
    } catch (error) {
      this.deps.logger.warn({ err: error }, 'Could not start a paired game');
    }
    for (const entry of [first, second]) {
      this.deps.hub.sendToPlayer(entry.id, {
        t: 'queue.status',
        queued: false,
        timeControl: null,
        rated: false,
      });
    }
  }
}
