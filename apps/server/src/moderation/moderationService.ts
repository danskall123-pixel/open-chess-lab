import type { PrismaClient } from '@prisma/client';
import type { FlagView, MarkAccountResponse } from '@open-chess-lab/shared';
import { isColor } from '@open-chess-lab/shared';
import { notFound } from '../http/errors.js';
import type { RatingService } from '../ratings/ratingService.js';

export class ModerationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ratings: RatingService,
  ) {}

  async listFlags(status: FlagView['status']): Promise<FlagView[]> {
    const flags = await this.prisma.fairPlayFlag.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { id: true, username: true, markedAt: true } } },
    });
    return flags.map((flag) => ({
      id: flag.id,
      user: { id: flag.user.id, username: flag.user.username, marked: flag.user.markedAt !== null },
      gameId: flag.gameId,
      color: isColor(flag.color) ? flag.color : 'white',
      metrics: {
        analyzedMoves: flag.analyzedMoves,
        topMoveMatches: flag.topMoveMatches,
        topMoveRate: flag.topMoveRate,
        averageCentipawnLoss: flag.averageCentipawnLoss,
      },
      status: flag.status,
      createdAt: flag.createdAt.toISOString(),
    }));
  }

  async dismissFlag(flagId: string, moderatorId: string): Promise<void> {
    const updated = await this.prisma.fairPlayFlag.updateMany({
      where: { id: flagId },
      data: { status: 'dismissed', reviewedById: moderatorId, reviewedAt: new Date() },
    });
    if (updated.count === 0) throw notFound('Flag not found.');
  }

  async markAccount(userId: string, moderatorId: string): Promise<MarkAccountResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound('User not found.');

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { markedAt: user.markedAt ?? new Date() },
      });
      await tx.fairPlayFlag.updateMany({
        where: { userId, status: 'open' },
        data: { status: 'confirmed', reviewedById: moderatorId, reviewedAt: new Date() },
      });
      const games = await tx.game.findMany({
        where: {
          rated: true,
          status: 'finished',
          OR: [{ whiteUserId: userId }, { blackUserId: userId }],
        },
        include: { refunds: true },
      });
      let refundedGames = 0;
      let refundedPoints = 0;
      for (const game of games) {
        const opponentIsWhite = game.blackUserId === userId;
        const opponentId = opponentIsWhite ? game.whiteUserId : game.blackUserId;
        const opponentDiff = opponentIsWhite ? game.whiteRatingDiff : game.blackRatingDiff;
        if (!opponentId || opponentDiff === null || opponentDiff >= 0) continue;
        if (game.refunds.some((refund) => refund.userId === opponentId)) continue;
        const points = -opponentDiff;
        await this.ratings.adjust(tx, opponentId, game.speed, points, game.id);
        await tx.ratingRefund.create({
          data: {
            gameId: game.id,
            userId: opponentId,
            markedUserId: userId,
            speed: game.speed,
            points,
          },
        });
        refundedGames += 1;
        refundedPoints += points;
      }
      return { refundedGames, refundedPoints };
    });
  }

  async unmarkAccount(userId: string): Promise<void> {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId },
      data: { markedAt: null },
    });
    if (updated.count === 0) throw notFound('User not found.');
  }
}
