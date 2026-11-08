import type { Game, PrismaClient } from '@prisma/client';
import type {
  ClockState,
  Color,
  GameRecord,
  GameSource,
  GameSummary,
} from '@open-chess-lab/shared';
import { buildPgn, isColor, isTermination, resultOf } from '@open-chess-lab/shared';
import type { LiveGame, LiveGameInit, RestoredProgress } from './liveGame.js';
import type { PlayerIdentity } from '../players.js';
import { playerKeyFor } from '../players.js';

export interface StoredLiveGame {
  init: LiveGameInit;
  progress: RestoredProgress;
}

const GAME_SOURCES: readonly GameSource[] = ['lobby', 'queue', 'invite', 'rematch'];

function parseSource(value: string): GameSource {
  return GAME_SOURCES.find((source) => source === value) ?? 'lobby';
}

function splitMoves(moves: string): string[] {
  return moves.length === 0 ? [] : moves.split(' ');
}

function pgnDate(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

export function pgnFor(game: LiveGame, appOrigin: string): string {
  const result = game.outcome ? resultOf(game.outcome) : '*';
  const { initialSeconds, incrementSeconds } = game.init.timeControl;
  return buildPgn({
    initialFen: game.initialFen,
    movesUci: game.movesUci,
    headers: {
      Event: `${game.rated ? 'Rated' : 'Casual'} ${game.speed} game`,
      Site: `${appOrigin}/game/${game.id}`,
      Date: pgnDate(game.init.startedAt),
      White: game.seats.white.player.name,
      Black: game.seats.black.player.name,
      Result: result,
      TimeControl: `${initialSeconds}+${incrementSeconds}`,
      ...(game.outcome ? { Termination: game.outcome.termination } : {}),
    },
  });
}

function identityFromRow(row: Game, color: Color): PlayerIdentity {
  const userId = color === 'white' ? row.whiteUserId : row.blackUserId;
  const guestId = (color === 'white' ? row.whiteGuestId : row.blackGuestId) ?? '';
  return {
    key: playerKeyFor(userId, guestId),
    userId,
    guestId,
    name: color === 'white' ? row.whiteName : row.blackName,
    role: 'user',
    marked: false,
  };
}

export function summaryFromRow(row: Game): GameSummary {
  const player = (color: Color) => ({
    userId: color === 'white' ? row.whiteUserId : row.blackUserId,
    name: color === 'white' ? row.whiteName : row.blackName,
    rating: color === 'white' ? row.whiteRatingBefore : row.blackRatingBefore,
    ratingChange: color === 'white' ? row.whiteRatingDiff : row.blackRatingDiff,
  });
  const result =
    row.result === '1-0' || row.result === '0-1' || row.result === '1/2-1/2' ? row.result : null;
  return {
    id: row.id,
    players: { white: player('white'), black: player('black') },
    status: row.status,
    result,
    termination: isTermination(row.termination) ? row.termination : null,
    rated: row.rated,
    speed: row.speed,
    timeControl: { initialSeconds: row.initialSeconds, incrementSeconds: row.incrementSeconds },
    movesCount: splitMoves(row.moves).length,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export function recordFromRow(row: Game): GameRecord {
  return {
    ...summaryFromRow(row),
    initialFen: row.initialFen,
    movesUci: splitMoves(row.moves),
    pgn: row.pgn ?? '',
  };
}

export class GameRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(game: LiveGame): Promise<void> {
    const { white, black } = game.seats;
    await this.prisma.game.create({
      data: {
        id: game.id,
        whiteUserId: white.player.userId,
        blackUserId: black.player.userId,
        whiteGuestId: white.player.userId ? null : white.player.guestId,
        blackGuestId: black.player.userId ? null : black.player.guestId,
        whiteName: white.player.name,
        blackName: black.player.name,
        whiteRatingBefore: white.rating ? Math.round(white.rating.rating) : null,
        blackRatingBefore: black.rating ? Math.round(black.rating.rating) : null,
        rated: game.rated,
        speed: game.speed,
        initialSeconds: game.init.timeControl.initialSeconds,
        incrementSeconds: game.init.timeControl.incrementSeconds,
        source: game.init.source,
        initialFen: game.initialFen,
        whiteClockMs: game.clock.remainingMs.white,
        blackClockMs: game.clock.remainingMs.black,
        startedAt: new Date(game.init.startedAt),
      },
    });
  }

  async saveProgress(game: LiveGame): Promise<void> {
    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        moves: game.movesUci.join(' '),
        whiteClockMs: Math.round(game.clock.remainingMs.white),
        blackClockMs: Math.round(game.clock.remainingMs.black),
        clockRunning: game.clock.running,
        turnStartedAt:
          game.clock.turnStartedAt === null ? null : new Date(game.clock.turnStartedAt),
      },
    });
  }

  async finalize(game: LiveGame, pgn: string, before: Record<Color, number> | null): Promise<void> {
    await this.prisma.game.update({
      where: { id: game.id },
      data: {
        status: game.status,
        moves: game.movesUci.join(' '),
        result: game.outcome ? resultOf(game.outcome) : null,
        termination: game.outcome?.termination ?? null,
        pgn,
        whiteClockMs: Math.round(game.clock.remainingMs.white),
        blackClockMs: Math.round(game.clock.remainingMs.black),
        clockRunning: null,
        turnStartedAt: null,
        endedAt: new Date(game.endedAt ?? Date.now()),
        whiteRatingDiff: game.ratingChanges?.white ?? null,
        blackRatingDiff: game.ratingChanges?.black ?? null,
        ...(before ? { whiteRatingBefore: before.white, blackRatingBefore: before.black } : {}),
      },
    });
  }

  async loadOngoing(): Promise<StoredLiveGame[]> {
    const rows = await this.prisma.game.findMany({ where: { status: 'ongoing' } });
    return rows.map((row) => this.toStoredLiveGame(row));
  }

  async markAborted(gameId: string): Promise<void> {
    await this.prisma.game.update({
      where: { id: gameId },
      data: { status: 'aborted', endedAt: new Date(), clockRunning: null },
    });
  }

  async findRecord(gameId: string): Promise<GameRecord | null> {
    const row = await this.prisma.game.findUnique({ where: { id: gameId } });
    return row ? recordFromRow(row) : null;
  }

  private toStoredLiveGame(row: Game): StoredLiveGame {
    const ratingOf = (before: number | null) =>
      before === null ? null : { rating: before, deviation: 100, volatility: 0.06 };
    const clock: ClockState = {
      remainingMs: { white: row.whiteClockMs, black: row.blackClockMs },
      incrementMs: row.incrementSeconds * 1000,
      running: isColor(row.clockRunning) ? row.clockRunning : null,
      turnStartedAt: row.turnStartedAt?.getTime() ?? null,
    };
    const movesUci = splitMoves(row.moves);
    return {
      init: {
        id: row.id,
        rated: row.rated,
        timeControl: { initialSeconds: row.initialSeconds, incrementSeconds: row.incrementSeconds },
        source: parseSource(row.source),
        seats: {
          white: { player: identityFromRow(row, 'white'), rating: ratingOf(row.whiteRatingBefore) },
          black: { player: identityFromRow(row, 'black'), rating: ratingOf(row.blackRatingBefore) },
        },
        startedAt: row.startedAt.getTime(),
        initialFen: row.initialFen,
      },
      progress: {
        movesUci,
        clock,
        lastMoveAt: row.turnStartedAt?.getTime() ?? row.startedAt.getTime(),
      },
    };
  }
}
