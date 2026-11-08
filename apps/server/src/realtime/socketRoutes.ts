import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ClientMessage } from '@open-chess-lab/shared';
import { isAllowedOrigin, requestHostsOf } from '../auth/csrf.js';
import { identityOf } from '../auth/sessionService.js';
import { HttpError } from '../http/errors.js';
import type { Services } from '../services.js';
import type { Connection } from './hub.js';
import { parseClientMessage } from './clientMessages.js';

const POLICY_VIOLATION = 1008;
const MAX_MESSAGES_PER_SECOND = 20;

function errorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  return 'Something went wrong.';
}

export function registerSocketRoutes(app: FastifyInstance, services: Services): void {
  const { hub, games, seeks, matchmaker } = services;

  const handle = async (connection: Connection, message: ClientMessage): Promise<void> => {
    switch (message.t) {
      case 'ping':
        if (message.rttMs !== null) hub.recordLag(connection, message.rttMs);
        hub.send(connection, { t: 'pong', sentAt: message.sentAt });
        return;
      case 'lobby.subscribe': {
        hub.setLobby(connection, true);
        hub.send(connection, {
          t: 'lobby.seeks',
          seeks: await seeks.listFor(connection.player.key),
        });
        const membership = await matchmaker.membership(connection.player.key);
        hub.send(connection, {
          t: 'queue.status',
          queued: membership !== null,
          timeControl: membership?.timeControl ?? null,
          rated: membership?.rated ?? false,
        });
        return;
      }
      case 'lobby.unsubscribe':
        hub.setLobby(connection, false);
        return;
      case 'game.watch':
        if (!games.watch(connection, message.gameId)) {
          hub.send(connection, { t: 'error', message: 'Game not found.' });
        }
        return;
      case 'game.unwatch':
        hub.unwatch(connection, message.gameId);
        return;
      case 'queue.join':
        await matchmaker.join(connection.player, message.timeControl, message.rated);
        return;
      case 'queue.leave':
        await matchmaker.leave(connection.player.key);
        return;
      default: {
        const result = await games.handle(connection.player, message);
        if (!result.ok) {
          hub.send(connection, { t: 'error', message: result.error });
          const game = games.get(message.gameId);
          if (game) hub.send(connection, { t: 'game.state', game: game.view(Date.now()) });
        }
      }
    }
  };

  app.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
    const hosts = requestHostsOf(request.headers);
    if (!isAllowedOrigin(request.headers.origin, [services.config.APP_ORIGIN], hosts)) {
      socket.close(POLICY_VIOLATION, 'Origin not allowed');
      return;
    }
    if (!request.session) {
      socket.close(POLICY_VIOLATION, 'No session');
      return;
    }
    const connection = hub.register(socket, identityOf(request.session));
    let windowStartedAt = Date.now();
    let messagesInWindow = 0;
    let pending = Promise.resolve();

    socket.on('message', (data: Buffer) => {
      const now = Date.now();
      if (now - windowStartedAt >= 1000) {
        windowStartedAt = now;
        messagesInWindow = 0;
      }
      messagesInWindow += 1;
      if (messagesInWindow > MAX_MESSAGES_PER_SECOND) {
        socket.close(POLICY_VIOLATION, 'Too many messages');
        return;
      }
      const message = parseClientMessage(data.toString('utf8'));
      if (!message) {
        hub.send(connection, { t: 'error', message: 'Malformed message.' });
        return;
      }
      pending = pending
        .then(() => handle(connection, message))
        .catch((error: unknown) => {
          if (!(error instanceof HttpError))
            request.log.error({ err: error }, 'Socket handler failed');
          hub.send(connection, { t: 'error', message: errorMessage(error) });
        });
    });
    socket.on('close', () => hub.unregister(connection));
    socket.on('error', () => hub.unregister(connection));
  });
}
