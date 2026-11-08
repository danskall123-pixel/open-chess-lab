import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { ProfileResponse, ResultStats } from '@open-chess-lab/shared';
import { usernameKey } from '../auth/validation.js';
import { notFound } from '../http/errors.js';
import { parseBody } from '../http/validation.js';
import { summaryFromRow } from '../games/gameRepository.js';
import type { Services } from '../services.js';

const PAGE_SIZE = 20;
const HISTORY_LIMIT = 500;
const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });

function gamesOf(userId: string): Prisma.GameWhereInput {
  return { status: 'finished', OR: [{ whiteUserId: userId }, { blackUserId: userId }] };
}

async function resultStats(services: Services, userId: string): Promise<ResultStats> {
  const [wonAsWhite, wonAsBlack, draws, total] = await Promise.all([
    services.prisma.game.count({
      where: { status: 'finished', whiteUserId: userId, result: '1-0' },
    }),
    services.prisma.game.count({
      where: { status: 'finished', blackUserId: userId, result: '0-1' },
    }),
    services.prisma.game.count({ where: { ...gamesOf(userId), result: '1/2-1/2' } }),
    services.prisma.game.count({ where: gamesOf(userId) }),
  ]);
  const wins = wonAsWhite + wonAsBlack;
  return { wins, draws, losses: total - wins - draws, total };
}

export function registerUserRoutes(app: FastifyInstance, services: Services): void {
  const findUser = async (username: string) => {
    const user = await services.prisma.user.findUnique({
      where: { usernameKey: usernameKey(username) },
    });
    if (!user) throw notFound('No player with that name.');
    return user;
  };

  app.get<{ Params: { username: string } }>('/api/users/:username', async (request) => {
    const user = await findUser(request.params.username);
    const [ratings, history, stats, recentGames] = await Promise.all([
      services.ratings.ratingsOf(user.id),
      services.prisma.ratingHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        take: HISTORY_LIMIT,
      }),
      resultStats(services, user.id),
      services.prisma.game.findMany({
        where: gamesOf(user.id),
        orderBy: { startedAt: 'desc' },
        take: PAGE_SIZE,
      }),
    ]);
    const profile: ProfileResponse = {
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      marked: user.markedAt !== null,
      ratings,
      history: history.map((point) => ({
        speed: point.speed,
        rating: Math.round(point.rating),
        at: point.createdAt.toISOString(),
      })),
      stats,
      games: recentGames.map(summaryFromRow),
    };
    return profile;
  });

  app.get<{ Params: { username: string } }>('/api/users/:username/games', async (request) => {
    const user = await findUser(request.params.username);
    const { page } = parseBody(pageSchema, request.query);
    const games = await services.prisma.game.findMany({
      where: gamesOf(user.id),
      orderBy: { startedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    return { page, games: games.map(summaryFromRow), hasMore: games.length === PAGE_SIZE };
  });
}
