import { Chess } from 'chess.js';
import type { Color, EngineScore } from '@open-chess-lab/shared';
import { parseUciScore, tryMove } from '@open-chess-lab/shared';

export interface EngineLine {
  multipv: number;
  depth: number;
  score: EngineScore;
  pv: string[];
}

function valueAfter(tokens: readonly string[], key: string): string | undefined {
  const index = tokens.indexOf(key);
  return index === -1 ? undefined : tokens[index + 1];
}

export function parseInfoLine(line: string, sideToMove: Color): EngineLine | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return null;
  const scoreIndex = tokens.indexOf('score');
  const pvIndex = tokens.indexOf('pv');
  const kind = tokens[scoreIndex + 1];
  const rawValue = tokens[scoreIndex + 2];
  if (
    scoreIndex === -1 ||
    pvIndex === -1 ||
    (kind !== 'cp' && kind !== 'mate') ||
    rawValue === undefined
  ) {
    return null;
  }
  return {
    multipv: Number(valueAfter(tokens, 'multipv') ?? '1'),
    depth: Number(valueAfter(tokens, 'depth') ?? '0'),
    score: parseUciScore(kind, Number(rawValue), sideToMove),
    pv: tokens.slice(pvIndex + 1),
  };
}

export function parseBestMove(line: string): string | null | undefined {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'bestmove') return undefined;
  const move = tokens[1];
  return move === undefined || move === '(none)' ? null : move;
}

export function sideToMoveOf(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

export function pvToSan(fen: string, pv: readonly string[], limit = 10): string[] {
  const chess = new Chess(fen);
  const sans: string[] = [];
  for (const uci of pv.slice(0, limit)) {
    const move = tryMove(chess, uci);
    if (!move) break;
    sans.push(move.san);
  }
  return sans;
}

export function formatPvLine(fen: string, pv: readonly string[], limit = 10): string {
  const chess = new Chess(fen);
  let moveNumber = chess.moveNumber();
  let whiteToMove = chess.turn() === 'w';
  const parts: string[] = [];
  pvToSan(fen, pv, limit).forEach((san, index) => {
    if (whiteToMove) parts.push(`${moveNumber}.`);
    else if (index === 0) parts.push(`${moveNumber}…`);
    parts.push(san);
    if (!whiteToMove) moveNumber += 1;
    whiteToMove = !whiteToMove;
  });
  return parts.join(' ');
}
