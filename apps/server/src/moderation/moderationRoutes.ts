import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireModerator } from '../auth/sessionHooks.js';
import { parseBody } from '../http/validation.js';
import type { Services } from '../services.js';

const flagQuerySchema = z.object({
  status: z.enum(['open', 'dismissed', 'confirmed']).default('open'),
});

export function registerModerationRoutes(app: FastifyInstance, services: Services): void {
  app.get('/api/mod/flags', async (request) => {
    requireModerator(request);
    const { status } = parseBody(flagQuerySchema, request.query);
    return { flags: await services.moderation.listFlags(status) };
  });

  app.post<{ Params: { id: string } }>('/api/mod/flags/:id/dismiss', async (request, reply) => {
    const moderator = requireModerator(request);
    await services.moderation.dismissFlag(request.params.id, moderator.user.id);
    reply.code(204);
  });

  app.post<{ Params: { userId: string } }>('/api/mod/users/:userId/mark', async (request) => {
    const moderator = requireModerator(request);
    return services.moderation.markAccount(request.params.userId, moderator.user.id);
  });

  app.post<{ Params: { userId: string } }>(
    '/api/mod/users/:userId/unmark',
    async (request, reply) => {
      requireModerator(request);
      await services.moderation.unmarkAccount(request.params.userId);
      reply.code(204);
    },
  );
}
