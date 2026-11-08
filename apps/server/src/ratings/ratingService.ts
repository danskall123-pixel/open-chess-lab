import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  Color,
  GameOutcome,
  Glicko2Rating,
  LeaderboardEntry,
  RatingView,
  Speed,
} from '@open-chess-lab/shared';
import {
  DEFAULT_RATING,
  PROVISIONAL_DEVIATION_THRESHOLD,
  SPEEDS,
  isProvisional,
  ratingAfterGame,
  ratingDelta,
  scoreFor,
} from '@open-chess-lab/shared';

type Database = PrismaClient | Prisma.TransactionClient;

export interface StoredRating extends Glicko2Rating {
  games: number;
}

export interface RatedGameResult {
  gameId: string;
  speed: Speed;
  userIds: Record<Color, string>;
  outcome: GameOutcome;
}

export interface RatingUpdate {
  before: Record<Color, number>;
  diffs: Record<Color, number>;
}

const LEADERBOARD_SIZE = 50;

export class RatingService {
  constructor(private readonly prisma: PrismaClient) {}

  async ratingOf(userId: string, speed: Speed, db: Database = this.prisma): Promise<StoredRating> {
    const stored = await db.rating.findUnique({ where: { userId_speed: { userId, speed } } });
    return stored ?? { ...DEFAULT_RATING, games: 0 };
  }

  async ratingsOf(userId: string): Promise<RatingView[]> {
    const stored = await this.prisma.rating.findMany({ where: { userId } });
    return SPEEDS.map((speed) => {
      const rating = stored.find((entry) => entry.speed === speed) ?? {
        ...DEFAULT_RATING,
        games: 0,
      };
      return {
        speed,
        rating: Math.round(rating.rating),
        deviation: Math.round(rating.deviation),
        provisional: isProvisional(rating.deviation),
        games: rating.games,
      };
    });
  }

  async applyResult(result: RatedGameResult): Promise<RatingUpdate> {
    return this.prisma.$transaction(async (tx) => {
      const white = await this.ratingOf(result.userIds.white, result.speed, tx);
      const black = await this.ratingOf(result.userIds.black, result.speed, tx);
      const nextWhite = ratingAfterGame(white, black, scoreFor(result.outcome, 'white'));
      const nextBlack = ratingAfterGame(black, white, scoreFor(result.outcome, 'black'));
      await this.store(
        tx,
        result.userIds.white,
        result.speed,
        nextWhite,
        white.games + 1,
        result.gameId,
      );
      await this.store(
        tx,
        result.userIds.black,
        result.speed,
        nextBlack,
        black.games + 1,
        result.gameId,
      );
      return {
        before: { white: Math.round(white.rating), black: Math.round(black.rating) },
        diffs: { white: ratingDelta(white, nextWhite), black: ratingDelta(black, nextBlack) },
      };
    });
  }

  async adjust(
    tx: Prisma.TransactionClient,
    userId: string,
    speed: Speed,
    points: number,
    gameId: string,
  ): Promise<void> {
    const current = await this.ratingOf(userId, speed, tx);
    await this.store(
      tx,
      userId,
      speed,
      { ...current, rating: current.rating + points },
      current.games,
      gameId,
    );
  }

  async leaderboard(speed: Speed): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.rating.findMany({
      where: {
        speed,
        deviation: { lte: PROVISIONAL_DEVIATION_THRESHOLD },
        user: { markedAt: null },
      },
      orderBy: { rating: 'desc' },
      take: LEADERBOARD_SIZE,
      include: { user: { select: { username: true } } },
    });
    return rows.map((row, index) => ({
      rank: index + 1,
      username: row.user.username,
      rating: Math.round(row.rating),
      deviation: Math.round(row.deviation),
      games: row.games,
    }));
  }

  private async store(
    tx: Prisma.TransactionClient,
    userId: string,
    speed: Speed,
    rating: Glicko2Rating,
    games: number,
    gameId: string,
  ): Promise<void> {
    const values = {
      rating: rating.rating,
      deviation: rating.deviation,
      volatility: rating.volatility,
      games,
    };
    await tx.rating.upsert({
      where: { userId_speed: { userId, speed } },
      create: { userId, speed, ...values },
      update: values,
    });
    await tx.ratingHistory.create({
      data: { userId, speed, rating: rating.rating, deviation: rating.deviation, gameId },
    });
  }
}
