import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { identityOf } from '../auth/sessionService.js';
import { requireSession } from '../auth/sessionHooks.js';
import { parseBody } from '../http/validation.js';
import type { Services } from '../services.js';

const ratingBound = z.number().int().min(400).max(3500).nullable().default(null);

const createSeekSchema = z.object({
  timeControl: z.object({
    initialSeconds: z.number().int(),
    incrementSeconds: z.number().int(),
  }),
  rated: z.boolean(),
  color: z.enum(['white', 'black', 'random']),
  ratingMin: ratingBound,
  ratingMax: ratingBound,
  isInvite: z.boolean().default(false),
});

export function registerSeekRoutes(app: FastifyInstance, services: Services): void {
  app.get('/api/seeks', async (request) => {
    const viewer = identityOf(requireSession(request));
    return { seeks: await services.seeks.listFor(viewer.key) };
  });

  app.post('/api/seeks', async (request, reply) => {
    const owner = identityOf(requireSession(request));
    const input = parseBody(createSeekSchema, request.body);
    reply.code(201);
    return { seek: await services.seeks.create(owner, input) };
  });

  app.get<{ Params: { id: string } }>('/api/seeks/:id', async (request) => {
    const viewer = identityOf(requireSession(request));
    return { seek: await services.seeks.find(request.params.id, viewer) };
  });

  app.delete<{ Params: { id: string } }>('/api/seeks/:id', async (request, reply) => {
    const owner = identityOf(requireSession(request));
    await services.seeks.cancel(owner, request.params.id);
    reply.code(204);
  });

  app.post<{ Params: { id: string } }>('/api/seeks/:id/accept', async (request) => {
    const acceptor = identityOf(requireSession(request));
    return { gameId: await services.seeks.accept(acceptor, request.params.id) };
  });
}
