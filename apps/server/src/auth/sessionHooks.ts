import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';
import { forbidden, unauthorized } from '../http/errors.js';
import {
  CSRF_HEADER,
  isAllowedOrigin,
  requestHostsOf,
  requiresCsrfCheck,
  tokensMatch,
} from './csrf.js';
import type { SessionContext, SessionService, SessionUserRecord } from './sessionService.js';

export const SESSION_COOKIE = 'ocl_session';

declare module 'fastify' {
  interface FastifyRequest {
    session: SessionContext | null;
  }
}

export type AuthenticatedSession = SessionContext & { user: SessionUserRecord };

export function registerSessionHooks(
  app: FastifyInstance,
  sessions: SessionService,
  config: AppConfig,
): void {
  app.decorateRequest('session', null);
  app.addHook('onRequest', async (request) => {
    request.session = await sessions.resolve(request.cookies[SESSION_COOKIE]);
    if (!requiresCsrfCheck(request.method) || !request.url.startsWith('/api/')) return;
    if (
      !isAllowedOrigin(request.headers.origin, [config.APP_ORIGIN], requestHostsOf(request.headers))
    ) {
      throw forbidden('Cross-origin request rejected.');
    }
    const provided = request.headers[CSRF_HEADER];
    const token = Array.isArray(provided) ? provided[0] : provided;
    if (!request.session || !tokensMatch(request.session.csrfToken, token)) {
      throw forbidden('Invalid CSRF token. Reload the page and try again.');
    }
  });
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  config: AppConfig,
  ttlMs: number,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    maxAge: Math.floor(ttlMs / 1000),
  });
}

export async function ensureSession(
  request: FastifyRequest,
  reply: FastifyReply,
  sessions: SessionService,
  config: AppConfig,
): Promise<SessionContext> {
  if (request.session) return request.session;
  const issued = await sessions.createGuest();
  setSessionCookie(reply, issued.token, config, sessions.ttlMs);
  request.session = issued.session;
  return issued.session;
}

export function requireSession(request: FastifyRequest): SessionContext {
  if (!request.session) throw unauthorized('Your session has expired. Reload the page.');
  return request.session;
}

export function requireUser(request: FastifyRequest): AuthenticatedSession {
  const session = requireSession(request);
  if (!session.user) throw unauthorized();
  return session as AuthenticatedSession;
}

export function requireModerator(request: FastifyRequest): AuthenticatedSession {
  const session = requireUser(request);
  if (session.user.role !== 'moderator') throw forbidden('Moderators only.');
  return session;
}
