import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Move } from 'chess.js';

export const STANDARD_START_FEN = DEFAULT_POSITION;

const UCI_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

export function parseUci(uci: string): MoveInput | null {
  const match = UCI_PATTERN.exec(uci);
  if (!match || !match[1] || !match[2]) return null;
  return match[3]
    ? { from: match[1], to: match[2], promotion: match[3] }
    : { from: match[1], to: match[2] };
}

export function uciOf(move: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export function tryMove(chess: Chess, uci: string): Move | null {
  const input = parseUci(uci);
  if (!input) return null;
  try {
    return chess.move(input);
  } catch {
    return null;
  }
}

export function replayUciMoves(initialFen: string, movesUci: readonly string[]): Chess {
  const chess = new Chess(initialFen);
  for (const uci of movesUci) {
    if (!tryMove(chess, uci)) throw new Error(`Illegal move ${uci} in stored game`);
  }
  return chess;
}

export function legalDestinations(chess: Chess): Map<string, string[]> {
  const destinations = new Map<string, string[]>();
  for (const move of chess.moves({ verbose: true })) {
    const targets = destinations.get(move.from) ?? [];
    targets.push(move.to);
    destinations.set(move.from, targets);
  }
  return destinations;
}

export function isPromotionMove(chess: Chess, from: string, to: string): boolean {
  return chess
    .moves({ verbose: true })
    .some((move) => move.from === from && move.to === to && move.promotion !== undefined);
}

export interface PgnBuildInput {
  headers: Record<string, string>;
  initialFen: string;
  movesUci: readonly string[];
}

export function buildPgn(input: PgnBuildInput): string {
  const chess = new Chess(input.initialFen);
  for (const uci of input.movesUci) tryMove(chess, uci);
  if (input.initialFen !== STANDARD_START_FEN) {
    chess.setHeader('SetUp', '1');
    chess.setHeader('FEN', input.initialFen);
  }
  for (const [key, value] of Object.entries(input.headers)) chess.setHeader(key, value);
  return chess.pgn();
}

export function sanMoves(initialFen: string, movesUci: readonly string[]): string[] {
  const chess = new Chess(initialFen);
  return movesUci.map((uci) => tryMove(chess, uci)?.san ?? uci);
}

export function positionAfter(
  initialFen: string,
  movesUci: readonly string[],
  ply: number,
): string {
  return replayUciMoves(initialFen, movesUci.slice(0, ply)).fen();
}

export function lastMoveSquares(movesUci: readonly string[], ply: number): [string, string] | null {
  const uci = ply > 0 ? movesUci[ply - 1] : undefined;
  const parsed = uci ? parseUci(uci) : null;
  return parsed ? [parsed.from, parsed.to] : null;
}
