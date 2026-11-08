import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isSpeed } from '@open-chess-lab/shared';
import { badRequest, notFound } from '../http/errors.js';
import type { Services } from '../services.js';

const gameIdSchema = z.string().regex(/^[A-Za-z0-9]{6,32}$/);

export function registerGameRoutes(app: FastifyInstance, services: Services): void {
  app.get<{ Params: { id: string } }>('/api/games/:id', async (request) => {
    const id = gameIdSchema.safeParse(request.params.id);
    if (!id.success) throw notFound('Game not found.');
    const live = services.games.get(id.data);
    if (live?.isOngoing) return { live: true, game: live.view(Date.now()) };
    const record = await services.gameRepository.findRecord(id.data);
    if (record && record.status !== 'ongoing') return { live: false, record };
    if (live) return { live: true, game: live.view(Date.now()) };
    throw notFound('Game not found.');
  });

  app.get<{ Params: { id: string } }>('/api/games/:id/pgn', async (request, reply) => {
    const record = await services.gameRepository.findRecord(request.params.id);
    if (!record || !record.pgn) throw notFound('Game not found.');
    reply
      .header('content-type', 'application/x-chess-pgn; charset=utf-8')
      .header('content-disposition', `attachment; filename="${record.id}.pgn"`);
    return record.pgn;
  });

  app.get<{ Params: { speed: string } }>('/api/leaderboard/:speed', async (request) => {
    const speed = request.params.speed;
    if (!isSpeed(speed)) throw badRequest('Unknown time control.');
    return { speed, entries: await services.ratings.leaderboard(speed) };
  });

  app.get('/api/stats', async () => ({
    players: services.hub.onlinePlayerCount(),
    games: services.games.ongoingCount(),
  }));
}
