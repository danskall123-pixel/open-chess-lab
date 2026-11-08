import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MeResponse } from '@open-chess-lab/shared';
import { Prisma } from '@prisma/client';
import { conflict, unauthorized } from '../http/errors.js';
import { parseBody } from '../http/validation.js';
import { randomToken, sha256 } from '../ids.js';
import type { Services } from '../services.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from './password.js';
import { ensureSession, requireSession, setSessionCookie } from './sessionHooks.js';
import type { SessionContext } from './sessionService.js';
import { identityOf } from './sessionService.js';
import {
  loginSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
  usernameKey,
} from './validation.js';

const RESET_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export function meResponse(services: Services, session: SessionContext): MeResponse {
  const user = session.user;
  return {
    user: user
      ? {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          marked: user.markedAt !== null,
        }
      : null,
    playerKey: identityOf(session).key,
    guestName: session.guestName,
    csrfToken: session.csrfToken,
    activeRatedGameId: services.games.activeRatedGameIdOf(identityOf(session).key),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function registerAuthRoutes(app: FastifyInstance, services: Services): void {
  const { config, prisma, sessions, mailer } = services;

  const startSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
  ): Promise<MeResponse> => {
    const issued = await sessions.loginAs(request.session, userId);
    setSessionCookie(reply, issued.token, config, sessions.ttlMs);
    return meResponse(services, issued.session);
  };

  app.get('/api/me', async (request, reply) => {
    const session = await ensureSession(request, reply, sessions, config);
    return meResponse(services, session);
  });

  app.post('/api/auth/register', { config: authRateLimit }, async (request, reply) => {
    requireSession(request);
    const input = parseBody(registerSchema, request.body);
    const key = usernameKey(input.username);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ usernameKey: key }, { email: input.email }] },
      select: { usernameKey: true },
    });
    if (existing) {
      throw conflict(
        existing.usernameKey === key
          ? 'That username is already taken.'
          : 'An account with that email already exists.',
      );
    }
    try {
      const user = await prisma.user.create({
        data: {
          username: input.username,
          usernameKey: key,
          email: input.email,
          passwordHash: await hashPassword(input.password),
        },
      });
      reply.code(201);
      return await startSession(request, reply, user.id);
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict('That username or email is already taken.');
      throw error;
    }
  });

  app.post('/api/auth/login', { config: authRateLimit }, async (request, reply) => {
    requireSession(request);
    const input = parseBody(loginSchema, request.body);
    const login = input.login.toLowerCase();
    const user = await prisma.user.findFirst({
      where: { OR: [{ usernameKey: login }, { email: login }] },
    });
    const valid = user
      ? await verifyPassword(user.passwordHash, input.password)
      : await burnPasswordCheck(input.password);
    if (!user || !valid) throw unauthorized('Wrong username or password.');
    return startSession(request, reply, user.id);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const session = requireSession(request);
    await sessions.destroy(session);
    const issued = await sessions.createGuest();
    setSessionCookie(reply, issued.token, config, sessions.ttlMs);
    return meResponse(services, issued.session);
  });

  app.post(
    '/api/auth/password-reset/request',
    { config: authRateLimit },
    async (request, reply) => {
      requireSession(request);
      const { email } = parseBody(resetRequestSchema, request.body);
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        const token = randomToken();
        await prisma.passwordResetToken.create({
          data: {
            id: sha256(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + RESET_TOKEN_LIFETIME_MS),
          },
        });
        const link = `${config.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
        await mailer.send({
          to: user.email,
          subject: 'Reset your Open Chess Lab password',
          text: `Hello ${user.username},\n\nOpen this link within one hour to choose a new password:\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
        });
      }
      reply.code(204);
    },
  );

  app.post(
    '/api/auth/password-reset/confirm',
    { config: authRateLimit },
    async (request, reply) => {
      requireSession(request);
      const input = parseBody(resetConfirmSchema, request.body);
      const record = await prisma.passwordResetToken.findUnique({
        where: { id: sha256(input.token) },
      });
      if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
        throw unauthorized('This reset link is invalid or has expired.');
      }
      await prisma.$transaction([
        prisma.passwordResetToken.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
        prisma.user.update({
          where: { id: record.userId },
          data: { passwordHash: await hashPassword(input.password) },
        }),
      ]);
      await sessions.destroyAllForUser(record.userId);
      return startSession(request, reply, record.userId);
    },
  );
}
