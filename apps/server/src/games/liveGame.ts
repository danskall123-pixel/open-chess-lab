import { Chess } from 'chess.js';
import type {
  ClockState,
  Color,
  GameOutcome,
  GamePlayerView,
  GameSource,
  GameStatus,
  GameView,
  Glicko2Rating,
  Speed,
  TimeControl,
} from '@open-chess-lab/shared';
import {
  STANDARD_START_FEN,
  abandonmentOutcome,
  agreementOutcome,
  boundedLagCompensation,
  colorFromTurn,
  createClock,
  detectPositionOutcome,
  expectedRatingChanges,
  flaggedColor,
  isProvisional,
  oppositeColor,
  pressClock,
  remainingMs,
  resignationOutcome,
  snapshotClock,
  speedOf,
  startClock,
  stopClock,
  timeoutOutcome,
  tryMove,
} from '@open-chess-lab/shared';
import type { PlayerIdentity } from '../players.js';

export const FIRST_MOVE_TIMEOUT_MS = 30_000;
export const RECONNECT_TIMEOUT_MS = 30_000;

export interface Seat {
  player: PlayerIdentity;
  rating: Glicko2Rating | null;
}

export interface LiveGameInit {
  id: string;
  rated: boolean;
  timeControl: TimeControl;
  source: GameSource;
  seats: Record<Color, Seat>;
  startedAt: number;
  initialFen?: string;
}

export interface RestoredProgress {
  movesUci: readonly string[];
  clock: ClockState;
  lastMoveAt: number;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const success: ActionResult = { ok: true };

function failure(error: string): ActionResult {
  return { ok: false, error };
}

export class LiveGame {
  readonly speed: Speed;
  readonly initialFen: string;
  readonly movesUci: string[] = [];
  readonly sans: string[] = [];
  clock: ClockState;
  status: GameStatus = 'ongoing';
  outcome: GameOutcome | null = null;
  drawOfferBy: Color | null = null;
  rematchOfferBy: Color | null = null;
  rematchGameId: string | null = null;
  ratingChanges: Record<Color, number> | null = null;
  endedAt: number | null = null;
  private readonly chess: Chess;
  private lastMoveAt: number;
  private readonly disconnectedSince: Record<Color, number | null> = { white: null, black: null };

  constructor(readonly init: LiveGameInit) {
    this.speed = speedOf(init.timeControl);
    this.initialFen = init.initialFen ?? STANDARD_START_FEN;
    this.chess = new Chess(this.initialFen);
    this.clock = createClock(init.timeControl);
    this.lastMoveAt = init.startedAt;
  }

  static restore(init: LiveGameInit, progress: RestoredProgress): LiveGame {
    const game = new LiveGame(init);
    for (const uci of progress.movesUci) {
      const move = tryMove(game.chess, uci);
      if (!move) throw new Error(`Stored move ${uci} is illegal in game ${init.id}`);
      game.movesUci.push(uci);
      game.sans.push(move.san);
    }
    game.clock = progress.clock;
    game.lastMoveAt = progress.lastMoveAt;
    return game;
  }

  get id(): string {
    return this.init.id;
  }

  get rated(): boolean {
    return this.init.rated;
  }

  get seats(): Record<Color, Seat> {
    return this.init.seats;
  }

  get turn(): Color {
    return colorFromTurn(this.chess.turn());
  }

  get fen(): string {
    return this.chess.fen();
  }

  get isOngoing(): boolean {
    return this.status === 'ongoing';
  }

  get bothSidesMoved(): boolean {
    return this.movesUci.length >= 2;
  }

  get lastMoveTimestamp(): number {
    return this.lastMoveAt;
  }

  colorOf(playerKey: string): Color | null {
    if (this.seats.white.player.key === playerKey) return 'white';
    if (this.seats.black.player.key === playerKey) return 'black';
    return null;
  }

  firstMoveDeadline(): number | null {
    if (!this.isOngoing || this.bothSidesMoved) return null;
    return this.lastMoveAt + FIRST_MOVE_TIMEOUT_MS;
  }

  flagDeadline(): number | null {
    const running = this.clock.running;
    if (!this.isOngoing || running === null || this.clock.turnStartedAt === null) return null;
    return this.clock.turnStartedAt + this.clock.remainingMs[running];
  }

  claimableAt(claimer: Color): number | null {
    const since = this.disconnectedSince[oppositeColor(claimer)];
    if (!this.isOngoing || since === null || this.disconnectedSince[claimer] !== null) return null;
    return since + RECONNECT_TIMEOUT_MS;
  }

  nextDeadline(now: number): number | null {
    const upcomingClaims = [this.claimableAt('white'), this.claimableAt('black')].filter(
      (value) => value !== null && value > now,
    );
    const candidates = [this.firstMoveDeadline(), this.flagDeadline(), ...upcomingClaims].filter(
      (value): value is number => value !== null,
    );
    return candidates.length === 0 ? null : Math.min(...candidates);
  }

  play(color: Color, uci: string, now: number, lagMs = 0): ActionResult {
    if (!this.isOngoing) return failure('The game is over.');
    if (this.expireIfDue(now, lagMs)) return failure('The game is over.');
    if (this.turn !== color) return failure('It is not your turn.');

    const move = tryMove(this.chess, uci);
    if (!move) return failure('Illegal move.');

    const ply = this.movesUci.length;
    if (ply === 1) this.clock = startClock(this.clock, oppositeColor(color), now);
    if (ply >= 2) this.clock = pressClock(this.clock, color, now, lagMs);

    this.movesUci.push(uci);
    this.sans.push(move.san);
    this.lastMoveAt = now;
    if (this.drawOfferBy === oppositeColor(color)) this.drawOfferBy = null;

    const outcome = detectPositionOutcome(this.chess);
    if (outcome) this.finish(outcome, now);
    return success;
  }

  expireIfDue(now: number, lagMs = 0): boolean {
    if (!this.isOngoing) return false;
    const deadline = this.firstMoveDeadline();
    if (deadline !== null && now >= deadline) {
      this.abort(now);
      return true;
    }
    const running = this.clock.running;
    if (running !== null) {
      const credit = boundedLagCompensation(lagMs);
      const flagged = flaggedColor(this.clock, now - credit);
      if (flagged !== null) {
        this.clock = {
          ...stopClock(this.clock, now),
          remainingMs: { ...this.clock.remainingMs, [flagged]: 0 },
        };
        this.finish(timeoutOutcome(this.chess, flagged), now);
        return true;
      }
    }
    return false;
  }

  resign(color: Color, now: number): ActionResult {
    if (!this.isOngoing) return failure('The game is over.');
    if (this.expireIfDue(now)) return failure('The game is over.');
    if (!this.bothSidesMoved) {
      this.abort(now);
      return success;
    }
    this.finish(resignationOutcome(color), now);
    return success;
  }

  requestAbort(now: number): ActionResult {
    if (!this.isOngoing) return failure('The game is over.');
    if (this.bothSidesMoved) return failure('The game can no longer be aborted.');
    this.abort(now);
    return success;
  }

  offerDraw(color: Color, now: number): ActionResult {
    if (!this.isOngoing) return failure('The game is over.');
    if (this.expireIfDue(now)) return failure('The game is over.');
    if (!this.bothSidesMoved) return failure('Both sides must move before offering a draw.');
    if (this.drawOfferBy === oppositeColor(color)) return this.acceptDraw(color, now);
    this.drawOfferBy = color;
    return success;
  }

  acceptDraw(color: Color, now: number): ActionResult {
    if (!this.isOngoing) return failure('The game is over.');
    if (this.drawOfferBy !== oppositeColor(color)) return failure('There is no draw offer.');
    if (this.expireIfDue(now)) return failure('The game is over.');
    this.finish(agreementOutcome(), now);
    return success;
  }

  declineDraw(color: Color): ActionResult {
    if (this.drawOfferBy !== oppositeColor(color)) return failure('There is no draw offer.');
    this.drawOfferBy = null;
    return success;
  }

  setConnected(color: Color, connected: boolean, now: number): boolean {
    const wasConnected = this.disconnectedSince[color] === null;
    if (wasConnected === connected) return false;
    this.disconnectedSince[color] = connected ? null : now;
    return true;
  }

  isConnected(color: Color): boolean {
    return this.disconnectedSince[color] === null;
  }

  claimVictory(color: Color, now: number): ActionResult {
    if (!this.isOngoing) return failure('The game is over.');
    if (this.expireIfDue(now)) return failure('The game is over.');
    const claimable = this.claimableAt(color);
    if (claimable === null || now < claimable) {
      return failure('Your opponent can still reconnect.');
    }
    if (!this.bothSidesMoved) {
      this.abort(now);
      return success;
    }
    this.finish(abandonmentOutcome(oppositeColor(color)), now);
    return success;
  }

  view(now: number): GameView {
    const playerView = (color: Color): GamePlayerView => {
      const seat = this.seats[color];
      return {
        key: seat.player.key,
        userId: seat.player.userId,
        name: seat.player.name,
        isGuest: seat.player.userId === null,
        rating: seat.rating ? Math.round(seat.rating.rating) : null,
        provisional: seat.rating ? isProvisional(seat.rating.deviation) : false,
        connected: this.isConnected(color),
      };
    };
    const firstMoveDeadline = this.firstMoveDeadline();
    return {
      id: this.id,
      rated: this.rated,
      speed: this.speed,
      timeControl: this.init.timeControl,
      source: this.init.source,
      initialFen: this.initialFen,
      movesUci: [...this.movesUci],
      sans: [...this.sans],
      fen: this.fen,
      turn: this.turn,
      status: this.status,
      outcome: this.outcome,
      players: { white: playerView('white'), black: playerView('black') },
      clockMs: snapshotClock(this.clock, now),
      clockRunning: this.isOngoing ? this.clock.running : null,
      drawOfferBy: this.drawOfferBy,
      rematchOfferBy: this.rematchOfferBy,
      rematchGameId: this.rematchGameId,
      ratingChanges: this.ratingChanges,
      expectedChanges: this.expectedChanges(),
      abortable: this.isOngoing && !this.bothSidesMoved,
      firstMoveDeadlineMs: firstMoveDeadline === null ? null : Math.max(0, firstMoveDeadline - now),
      disconnected: this.disconnectionView(now),
      startedAt: new Date(this.init.startedAt).toISOString(),
    };
  }

  remainingFor(color: Color, now: number): number {
    return remainingMs(this.clock, color, now);
  }

  private expectedChanges(): GameView['expectedChanges'] {
    const white = this.seats.white.rating;
    const black = this.seats.black.rating;
    if (!this.rated || !white || !black) return null;
    return {
      white: expectedRatingChanges(white, black),
      black: expectedRatingChanges(black, white),
    };
  }

  private disconnectionView(now: number): GameView['disconnected'] {
    if (!this.isOngoing) return null;
    for (const claimer of ['white', 'black'] as const) {
      const claimable = this.claimableAt(claimer);
      if (claimable !== null) {
        return { color: oppositeColor(claimer), claimableInMs: Math.max(0, claimable - now) };
      }
    }
    return null;
  }

  private finish(outcome: GameOutcome, now: number): void {
    this.clock = stopClock(this.clock, now);
    this.status = 'finished';
    this.outcome = outcome;
    this.drawOfferBy = null;
    this.endedAt = now;
  }

  private abort(now: number): void {
    this.clock = stopClock(this.clock, now);
    this.status = 'aborted';
    this.drawOfferBy = null;
    this.endedAt = now;
  }
}
