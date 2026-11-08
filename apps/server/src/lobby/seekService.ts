import { randomInt } from 'node:crypto';
import type { Color, CreateSeekRequest, SeekView } from '@open-chess-lab/shared';
import {
  isProvisional,
  isValidTimeControl,
  isWithinSeekRange,
  speedOf,
} from '@open-chess-lab/shared';
import type { GameManager } from '../games/gameManager.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { randomGameId } from '../ids.js';
import type { PlayerIdentity } from '../players.js';
import { canPlayRated } from '../players.js';
import type { RatingService } from '../ratings/ratingService.js';
import type { Hub, PresenceListener } from '../realtime/hub.js';
import type { SeekStore, StoredSeek } from './seekStore.js';

const MAX_PUBLIC_SEEKS_PER_PLAYER = 3;

export interface SeekServiceDependencies {
  store: SeekStore;
  games: GameManager;
  ratings: RatingService;
  hub: Hub;
  onGameStarted: (playerKeys: string[]) => Promise<void>;
}

export function toSeekView(seek: StoredSeek, viewerKey: string): SeekView {
  return {
    id: seek.id,
    timeControl: seek.timeControl,
    speed: speedOf(seek.timeControl),
    rated: seek.rated,
    color: seek.color,
    ratingRange: { min: seek.ratingMin, max: seek.ratingMax },
    owner: {
      name: seek.owner.name,
      rating: seek.ownerRating ? Math.round(seek.ownerRating.rating) : null,
      provisional: seek.ownerRating ? isProvisional(seek.ownerRating.deviation) : false,
      isGuest: seek.owner.userId === null,
    },
    mine: seek.owner.key === viewerKey,
    isInvite: seek.isInvite,
    createdAt: seek.createdAt,
  };
}

function assignColors(seek: StoredSeek): Color {
  if (seek.color !== 'random') return seek.color;
  return randomInt(2) === 0 ? 'white' : 'black';
}

export class SeekService implements PresenceListener {
  constructor(private readonly deps: SeekServiceDependencies) {
    deps.hub.addPresenceListener(this);
  }

  async create(owner: PlayerIdentity, request: CreateSeekRequest): Promise<SeekView> {
    if (!isValidTimeControl(request.timeControl))
      throw badRequest('That time control is not supported.');
    if (request.rated && !canPlayRated(owner)) {
      throw forbidden('Create an account to play rated games.');
    }
    const { ratingMin, ratingMax } = request;
    if (ratingMin !== null && ratingMax !== null && ratingMin > ratingMax) {
      throw badRequest('The minimum rating must not exceed the maximum rating.');
    }
    const existing = await this.deps.store.all();
    const ownPublic = existing.filter((seek) => seek.owner.key === owner.key && !seek.isInvite);
    if (!request.isInvite && ownPublic.length >= MAX_PUBLIC_SEEKS_PER_PLAYER) {
      throw conflict(`You can have at most ${MAX_PUBLIC_SEEKS_PER_PLAYER} open seeks.`);
    }
    const ownerRating = owner.userId
      ? await this.deps.ratings.ratingOf(owner.userId, speedOf(request.timeControl))
      : null;
    const seek: StoredSeek = {
      id: randomGameId(),
      owner,
      ownerRating: ownerRating
        ? { rating: ownerRating.rating, deviation: ownerRating.deviation }
        : null,
      timeControl: request.timeControl,
      rated: request.rated,
      color: request.color,
      ratingMin: request.isInvite ? null : ratingMin,
      ratingMax: request.isInvite ? null : ratingMax,
      isInvite: request.isInvite,
      createdAt: Date.now(),
    };
    await this.deps.store.save(seek);
    if (!seek.isInvite) await this.broadcast();
    return toSeekView(seek, owner.key);
  }

  async find(id: string, viewer: PlayerIdentity): Promise<SeekView> {
    const seek = await this.deps.store.get(id);
    if (!seek) throw notFound('This challenge is no longer available.');
    return toSeekView(seek, viewer.key);
  }

  async cancel(owner: PlayerIdentity, id: string): Promise<void> {
    const seek = await this.deps.store.get(id);
    if (!seek) return;
    if (seek.owner.key !== owner.key) throw forbidden('That seek belongs to someone else.');
    await this.deps.store.claim(id);
    if (!seek.isInvite) await this.broadcast();
  }

  async accept(acceptor: PlayerIdentity, id: string): Promise<string> {
    const seek = await this.deps.store.get(id);
    if (!seek) throw notFound('This seek is no longer available.');
    if (seek.owner.key === acceptor.key) throw conflict('You cannot accept your own seek.');
    if (seek.rated && !canPlayRated(acceptor))
      throw forbidden('Create an account to play rated games.');
    if (seek.rated && acceptor.userId) {
      const rating = await this.deps.ratings.ratingOf(acceptor.userId, speedOf(seek.timeControl));
      if (
        !isWithinSeekRange(Math.round(rating.rating), { min: seek.ratingMin, max: seek.ratingMax })
      ) {
        throw forbidden('Your rating is outside the range this player asked for.');
      }
    }
    this.deps.games.assertAvailable(acceptor);
    this.deps.games.assertAvailable(seek.owner);
    if (!(await this.deps.store.claim(id)))
      throw notFound('Someone else accepted this seek first.');

    const ownerColor = assignColors(seek);
    try {
      const game = await this.deps.games.createGame({
        white: ownerColor === 'white' ? seek.owner : acceptor,
        black: ownerColor === 'white' ? acceptor : seek.owner,
        rated: seek.rated,
        timeControl: seek.timeControl,
        source: seek.isInvite ? 'invite' : 'lobby',
      });
      await this.removePublicSeeksOf([seek.owner.key, acceptor.key]);
      await this.deps.onGameStarted([seek.owner.key, acceptor.key]);
      return game.id;
    } catch (error) {
      await this.deps.store.save(seek);
      throw error;
    }
  }

  async removePublicSeeksOf(playerKeys: readonly string[]): Promise<void> {
    const removed = await this.deps.store.removeWhere(
      (seek) => !seek.isInvite && playerKeys.includes(seek.owner.key),
    );
    if (removed > 0) await this.broadcast();
  }

  async clearPublicSeeks(): Promise<void> {
    await this.deps.store.clearPublicSeeks();
  }

  async listFor(viewerKey: string): Promise<SeekView[]> {
    const seeks = await this.deps.store.all();
    return seeks
      .filter((seek) => !seek.isInvite)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((seek) => toSeekView(seek, viewerKey));
  }

  async broadcast(): Promise<void> {
    const seeks = (await this.deps.store.all()).filter((seek) => !seek.isInvite);
    for (const connection of this.deps.hub.lobbyConnections()) {
      this.deps.hub.send(connection, {
        t: 'lobby.seeks',
        seeks: seeks.map((seek) => toSeekView(seek, connection.player.key)),
      });
    }
  }

  onPresenceChange(playerKey: string): void {
    if (this.deps.hub.isOnline(playerKey)) return;
    void this.removePublicSeeksOf([playerKey]);
  }
}
