import { z } from 'zod';
import type { ClientMessage } from '@open-chess-lab/shared';

const gameId = z.string().min(1).max(32);
const gameAction = <T extends string>(type: T) => z.object({ t: z.literal(type), gameId });

const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('ping'),
    sentAt: z.number(),
    rttMs: z.number().min(0).max(60_000).nullable(),
  }),
  z.object({ t: z.literal('lobby.subscribe') }),
  z.object({ t: z.literal('lobby.unsubscribe') }),
  gameAction('game.watch'),
  gameAction('game.unwatch'),
  z.object({
    t: z.literal('game.move'),
    gameId,
    uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
    ply: z.number().int().min(0),
  }),
  gameAction('game.resign'),
  gameAction('game.abort'),
  gameAction('game.draw.offer'),
  gameAction('game.draw.accept'),
  gameAction('game.draw.decline'),
  gameAction('game.claimVictory'),
  gameAction('game.rematch.offer'),
  gameAction('game.rematch.decline'),
  z.object({
    t: z.literal('queue.join'),
    timeControl: z.object({ initialSeconds: z.number().int(), incrementSeconds: z.number().int() }),
    rated: z.boolean(),
  }),
  z.object({ t: z.literal('queue.leave') }),
]);

const MAX_MESSAGE_BYTES = 4096;

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  try {
    const parsed = clientMessageSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
