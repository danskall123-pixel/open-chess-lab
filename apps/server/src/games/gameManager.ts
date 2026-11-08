import type { FastifyBaseLogger } from 'fastify';
import type { ClientMessage, Color, GameSource, TimeControl } from '@open-chess-lab/shared';
import { oppositeColor, speedOf } from '@open-chess-lab/shared';
import { conflict } from '../http/errors.js';
import { randomGameId } from '../ids.js';
import type { PlayerIdentity } from '../players.js';
import { canPlayRated } from '../players.js';
import type { RatingService } from '../ratings/ratingService.js';
import type { Connection, Hub, PresenceListener } from '../realtime/hub.js';
import type { ActionResult, Seat } from './liveGame.js';
import { LiveGame } from './liveGame.js';
import type { GameRepository } from './gameRepository.js';
import { pgnFor } from './gameRepository.js';

export interface NewGameRequest {
  white: PlayerIdentity;
  black: PlayerIdentity;
  rated: boolean;
  timeControl: TimeControl;
  source: GameSource;
}

export interface FinishedGameListener {
  onGameFinished(game: LiveGame): void;
}

export interface GameManagerDependencies {
  repository: GameRepository;
  ratings: RatingService;
  hub: Hub;
  logger: FastifyBaseLogger;
  appOrigin: string;
  now?: () => number;
}

type GameAction = Extract<ClientMessage, { gameId: string }>;

const FINISHED_GAME_RETENTION_MS = 10 * 60 * 1000;
const TIMER_SLACK_MS = 10;

export class GameManager implements PresenceListener {
  private readonly games = new Map<string, LiveGame>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly writes = new Map<string, Promise<void>>();
  private readonly finalized = new Set<string>();
  private readonly finishedListeners: FinishedGameListener[] = [];
  private readonly now: () => number;

  constructor(private readonly deps: GameManagerDependencies) {
    this.now = deps.now ?? Date.now;
    deps.hub.addPresenceListener(this);
  }

  addFinishedListener(listener: FinishedGameListener): void {
    this.finishedListeners.push(listener);
  }

  get(gameId: string): LiveGame | undefined {
    return this.games.get(gameId);
  }

  ongoingCount(): number {
    return [...this.games.values()].filter((game) => game.isOngoing).length;
  }

  activeGameOf(playerKey: string): LiveGame | undefined {
    return [...this.games.values()].find(
      (game) => game.isOngoing && game.colorOf(playerKey) !== null,
    );
  }

  activeRatedGameIdOf(playerKey: string): string | null {
    const game = this.activeGameOf(playerKey);
    return game?.rated ? game.id : null;
  }

  assertAvailable(player: PlayerIdentity): void {
    if (this.activeGameOf(player.key)) throw conflict('Finish your current game first.');
  }

  async createGame(request: NewGameRequest): Promise<LiveGame> {
    const { white, black, rated, timeControl, source } = request;
    if (white.key === black.key) throw conflict('You cannot play against yourself.');
    if (rated && !(canPlayRated(white) && canPlayRated(black))) {
      throw conflict('Rated games need two registered players in good standing.');
    }
    this.assertAvailable(white);
    this.assertAvailable(black);

    const speed = speedOf(timeControl);
    const seatFor = async (player: PlayerIdentity): Promise<Seat> => ({
      player,
      rating: player.userId ? await this.deps.ratings.ratingOf(player.userId, speed) : null,
    });
    const game = new LiveGame({
      id: randomGameId(),
      rated,
      timeControl,
      source,
      seats: { white: await seatFor(white), black: await seatFor(black) },
      startedAt: this.now(),
    });
    await this.deps.repository.create(game);
    this.games.set(game.id, game);
    for (const color of ['white', 'black'] as const) {
      game.setConnected(color, this.deps.hub.isOnline(game.seats[color].player.key), this.now());
    }
    this.schedule(game);
    this.deps.hub.sendToPlayer(white.key, { t: 'game.started', gameId: game.id });
    this.deps.hub.sendToPlayer(black.key, { t: 'game.started', gameId: game.id });
    this.deps.logger.info({ gameId: game.id, rated, source }, 'Game started');
    return game;
  }

  watch(connection: Connection, gameId: string): boolean {
    const game = this.games.get(gameId);
    if (!game) return false;
    this.deps.hub.watch(connection, gameId);
    this.deps.hub.send(connection, { t: 'game.state', game: game.view(this.now()) });
    return true;
  }

  onPresenceChange(playerKey: string): void {
    const now = this.now();
    for (const game of this.games.values()) {
      const color = game.colorOf(playerKey);
      if (color === null || !game.isOngoing) continue;
      const connected = this.deps.hub.isWatching(playerKey, game.id);
      if (game.setConnected(color, connected, now)) this.publish(game);
    }
  }

  async handle(player: PlayerIdentity, message: GameAction): Promise<ActionResult> {
    const game = this.games.get(message.gameId);
    if (!game) return { ok: false, error: 'Game not found.' };
    const color = game.colorOf(player.key);
    if (color === null) return { ok: false, error: 'You are not playing in this game.' };
    const now = this.now();

    try {
      const result = await this.dispatch(game, color, player, message, now);
      if (result.ok) this.afterChange(game);
      return result;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Something went wrong.' };
    }
  }

  async restore(): Promise<void> {
    const stored = await this.deps.repository.loadOngoing();
    const now = this.now();
    for (const { init, progress } of stored) {
      try {
        const clock =
          progress.clock.running === null
            ? progress.clock
            : { ...progress.clock, turnStartedAt: now };
        const seats = { ...init.seats };
        for (const color of ['white', 'black'] as const) {
          const userId = seats[color].player.userId;
          if (userId) {
            seats[color] = {
              ...seats[color],
              rating: await this.deps.ratings.ratingOf(userId, speedOf(init.timeControl)),
            };
          }
        }
        const game = LiveGame.restore({ ...init, seats }, { ...progress, clock, lastMoveAt: now });
        game.setConnected('white', false, now);
        game.setConnected('black', false, now);
        this.games.set(game.id, game);
        this.schedule(game);
      } catch (error) {
        this.deps.logger.warn(
          { err: error, gameId: init.id },
          'Could not restore game, aborting it',
        );
        await this.deps.repository.markAborted(init.id);
      }
    }
    if (stored.length > 0)
      this.deps.logger.info({ count: stored.length }, 'Restored ongoing games');
  }

  shutdown(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  async flush(): Promise<void> {
    await Promise.all(this.writes.values());
  }

  private async dispatch(
    game: LiveGame,
    color: Color,
    player: PlayerIdentity,
    message: GameAction,
    now: number,
  ): Promise<ActionResult> {
    switch (message.t) {
      case 'game.move':
        if (message.ply !== game.movesUci.length)
          return { ok: false, error: 'Out of sync, reloading.' };
        return game.play(color, message.uci, now, this.deps.hub.lagOf(player.key, game.id));
      case 'game.resign':
        return game.resign(color, now);
      case 'game.abort':
        return game.requestAbort(now);
      case 'game.draw.offer':
        return game.offerDraw(color, now);
      case 'game.draw.accept':
        return game.acceptDraw(color, now);
      case 'game.draw.decline':
        return game.declineDraw(color);
      case 'game.claimVictory':
        return game.claimVictory(color, now);
      case 'game.rematch.offer':
        return this.offerRematch(game, color);
      case 'game.rematch.decline':
        return this.declineRematch(game, color);
      case 'game.watch':
      case 'game.unwatch':
        return { ok: true };
    }
  }

  private async offerRematch(game: LiveGame, color: Color): Promise<ActionResult> {
    if (game.isOngoing) return { ok: false, error: 'The game is still running.' };
    if (game.rematchGameId) return { ok: false, error: 'A rematch has already started.' };
    if (game.rematchOfferBy !== oppositeColor(color)) {
      game.rematchOfferBy = color;
      return { ok: true };
    }
    const rematch = await this.createGame({
      white: game.seats.black.player,
      black: game.seats.white.player,
      rated: game.rated,
      timeControl: game.init.timeControl,
      source: 'rematch',
    });
    game.rematchGameId = rematch.id;
    game.rematchOfferBy = null;
    return { ok: true };
  }

  private declineRematch(game: LiveGame, color: Color): ActionResult {
    if (game.rematchOfferBy !== oppositeColor(color))
      return { ok: false, error: 'No rematch offer.' };
    game.rematchOfferBy = null;
    return { ok: true };
  }

  private afterChange(game: LiveGame): void {
    if (!game.isOngoing && !this.finalized.has(game.id)) {
      this.finalized.add(game.id);
      this.clearTimer(game.id);
      this.publish(game);
      this.enqueueWrite(game.id, () => this.finalize(game));
      return;
    }
    if (game.isOngoing) {
      this.enqueueWrite(game.id, () => this.deps.repository.saveProgress(game));
      this.schedule(game);
    }
    this.publish(game);
  }

  private async finalize(game: LiveGame): Promise<void> {
    let before: Record<Color, number> | null = null;
    const whiteId = game.seats.white.player.userId;
    const blackId = game.seats.black.player.userId;
    if (game.rated && game.status === 'finished' && game.outcome && whiteId && blackId) {
      const update = await this.deps.ratings.applyResult({
        gameId: game.id,
        speed: game.speed,
        userIds: { white: whiteId, black: blackId },
        outcome: game.outcome,
      });
      game.ratingChanges = update.diffs;
      before = update.before;
    }
    await this.deps.repository.finalize(game, pgnFor(game, this.deps.appOrigin), before);
    this.publish(game);
    if (game.status === 'finished') {
      for (const listener of this.finishedListeners) listener.onGameFinished(game);
    }
    setTimeout(() => this.forget(game.id), FINISHED_GAME_RETENTION_MS).unref();
  }

  private forget(gameId: string): void {
    this.games.delete(gameId);
    this.finalized.delete(gameId);
    this.writes.delete(gameId);
  }

  private enqueueWrite(gameId: string, write: () => Promise<void>): void {
    const previous = this.writes.get(gameId) ?? Promise.resolve();
    const next = previous
      .then(write)
      .catch((error: unknown) =>
        this.deps.logger.error({ err: error, gameId }, 'Game write failed'),
      );
    this.writes.set(gameId, next);
  }

  private publish(game: LiveGame): void {
    this.deps.hub.broadcastToGame(game.id, { t: 'game.state', game: game.view(this.now()) });
  }

  private schedule(game: LiveGame): void {
    this.clearTimer(game.id);
    const deadline = game.nextDeadline(this.now());
    if (deadline === null) return;
    const delay = Math.max(0, deadline - this.now()) + TIMER_SLACK_MS;
    const timer = setTimeout(() => this.onDeadline(game), delay);
    timer.unref();
    this.timers.set(game.id, timer);
  }

  private onDeadline(game: LiveGame): void {
    this.timers.delete(game.id);
    if (!game.isOngoing) return;
    if (game.expireIfDue(this.now())) {
      this.afterChange(game);
      return;
    }
    this.publish(game);
    this.schedule(game);
  }

  private clearTimer(gameId: string): void {
    const timer = this.timers.get(gameId);
    if (timer) clearTimeout(timer);
    this.timers.delete(gameId);
  }
}
