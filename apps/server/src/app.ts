import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from './config.js';
import { registerAuthRoutes } from './auth/authRoutes.js';
import { registerSessionHooks } from './auth/sessionHooks.js';
import { registerGameRoutes } from './games/gameRoutes.js';
import { HttpError } from './http/errors.js';
import { registerSeekRoutes } from './lobby/seekRoutes.js';
import { registerModerationRoutes } from './moderation/moderationRoutes.js';
import { registerSocketRoutes } from './realtime/socketRoutes.js';
import type { Redis } from './redis.js';
import type { Services } from './services.js';
import { createServices } from './services.js';
import { registerUserRoutes } from './users/userRoutes.js';

export interface BuiltApp {
  app: FastifyInstance;
  services: Services;
}

function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'Request failed');
    const message =
      statusCode >= 500 || !(error instanceof Error) ? 'Internal server error.' : error.message;
    return reply.code(statusCode).send({ error: message });
  });
}

async function registerWebApp(app: FastifyInstance, webDistDir: string | undefined): Promise<void> {
  if (!webDistDir) return;
  const root = resolve(webDistDir);
  if (!existsSync(root)) {
    app.log.warn({ root }, 'WEB_DIST_DIR does not exist, not serving the web app');
    return;
  }
  await app.register(fastifyStatic, { root, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    if (
      request.method !== 'GET' ||
      request.url.startsWith('/api/') ||
      request.url.startsWith('/ws')
    ) {
      return reply.code(404).send({ error: 'Not found.' });
    }
    return reply.sendFile('index.html');
  });
}

export async function buildApp(
  config: AppConfig,
  prisma: PrismaClient,
  redis: Redis,
): Promise<BuiltApp> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });
  const services = createServices(config, prisma, redis, app.log);

  registerErrorHandling(app);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });
  registerSessionHooks(app, services.sessions, config);

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    return payload;
  });
  app.get('/api/health', async () => ({ ok: true }));

  registerAuthRoutes(app, services);
  registerUserRoutes(app, services);
  registerGameRoutes(app, services);
  registerSeekRoutes(app, services);
  registerModerationRoutes(app, services);
  registerSocketRoutes(app, services);
  await registerWebApp(app, config.WEB_DIST_DIR);

  return { app, services };
}
