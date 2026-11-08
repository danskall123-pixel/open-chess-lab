import type { TimeControl } from './timeControl.js';
import type { GameView, SeekView } from './api.js';

export type ClientMessage =
  | { t: 'ping'; sentAt: number; rttMs: number | null }
  | { t: 'lobby.subscribe' }
  | { t: 'lobby.unsubscribe' }
  | { t: 'game.watch'; gameId: string }
  | { t: 'game.unwatch'; gameId: string }
  | { t: 'game.move'; gameId: string; uci: string; ply: number }
  | { t: 'game.resign'; gameId: string }
  | { t: 'game.abort'; gameId: string }
  | { t: 'game.draw.offer'; gameId: string }
  | { t: 'game.draw.accept'; gameId: string }
  | { t: 'game.draw.decline'; gameId: string }
  | { t: 'game.claimVictory'; gameId: string }
  | { t: 'game.rematch.offer'; gameId: string }
  | { t: 'game.rematch.decline'; gameId: string }
  | { t: 'queue.join'; timeControl: TimeControl; rated: boolean }
  | { t: 'queue.leave' };

export type ServerMessage =
  | { t: 'pong'; sentAt: number }
  | { t: 'lobby.seeks'; seeks: SeekView[] }
  | { t: 'lobby.counts'; players: number; games: number }
  | { t: 'game.state'; game: GameView }
  | { t: 'game.started'; gameId: string }
  | { t: 'queue.status'; queued: boolean; timeControl: TimeControl | null; rated: boolean }
  | { t: 'error'; message: string };

export type ClientMessageType = ClientMessage['t'];
