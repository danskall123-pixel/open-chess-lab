import { Chess, validateFen } from 'chess.js';
import { STANDARD_START_FEN, uciOf } from './chessUtils.js';

export type ImportResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ImportedMove {
  san: string;
  uci: string;
  fenAfter: string;
}

export interface ImportedGame {
  headers: Record<string, string>;
  initialFen: string;
  moves: ImportedMove[];
  pgn: string;
}

export interface PgnCollection {
  games: ImportedGame[];
  errors: Array<{ index: number; error: string }>;
}

const BYTE_ORDER_MARK = /^\uFEFF/;
const TAG_LINE = /^\s*\[[A-Za-z0-9_]+\s+".*"\s*\]\s*$/;

function normalizeNewlines(text: string): string {
  return text.replace(BYTE_ORDER_MARK, '').replace(/\r\n?/g, '\n');
}

export function splitPgnGames(text: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let currentHasMovetext = false;

  const flush = () => {
    const joined = current.join('\n').trim();
    if (joined.length > 0) games.push(joined);
    current = [];
    currentHasMovetext = false;
  };

  for (const line of normalizeNewlines(text).split('\n')) {
    const isTag = TAG_LINE.test(line);
    if (isTag && currentHasMovetext) flush();
    if (!isTag && line.trim().length > 0) currentHasMovetext = true;
    current.push(line);
  }
  flush();
  return games;
}

function cleanErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error:\s*/, '');
}

export function parsePgnGame(pgn: string): ImportResult<ImportedGame> {
  const trimmed = normalizeNewlines(pgn).trim();
  if (trimmed.length === 0) return { ok: false, error: 'The PGN is empty.' };

  const chess = new Chess();
  try {
    chess.loadPgn(trimmed);
  } catch (error) {
    return { ok: false, error: `Could not read the PGN: ${cleanErrorMessage(error)}` };
  }

  const headers = chess.getHeaders();
  const initialFen = headers.FEN ?? STANDARD_START_FEN;
  const moves = chess.history({ verbose: true }).map((move) => ({
    san: move.san,
    uci: uciOf(move),
    fenAfter: move.after,
  }));
  if (moves.length === 0 && Object.keys(headers).length === 0) {
    return { ok: false, error: 'No moves or headers were found in the PGN.' };
  }
  return { ok: true, value: { headers, initialFen, moves, pgn: trimmed } };
}

export function parsePgnCollection(text: string): PgnCollection {
  const collection: PgnCollection = { games: [], errors: [] };
  splitPgnGames(text).forEach((chunk, index) => {
    const result = parsePgnGame(chunk);
    if (result.ok) collection.games.push(result.value);
    else collection.errors.push({ index, error: `Game ${index + 1}: ${result.error}` });
  });
  return collection;
}

function countPieces(placement: string, piece: string): number {
  return [...placement].filter((character) => character === piece).length;
}

function placementError(placement: string): string | null {
  if (countPieces(placement, 'K') !== 1) return 'White must have exactly one king.';
  if (countPieces(placement, 'k') !== 1) return 'Black must have exactly one king.';
  const ranks = placement.split('/');
  const edgeRanks = [ranks[0] ?? '', ranks[7] ?? ''];
  if (edgeRanks.some((rank) => /[pP]/.test(rank))) {
    return 'Pawns cannot stand on the first or last rank.';
  }
  return null;
}

function opponentInCheck(fen: string): boolean {
  const fields = fen.split(' ');
  fields[1] = fields[1] === 'w' ? 'b' : 'w';
  fields[3] = '-';
  try {
    return new Chess(fields.join(' ')).isCheck();
  } catch {
    return false;
  }
}

export function normalizeFen(raw: string): string {
  const fields = raw.trim().split(/\s+/);
  if (fields.length === 4) fields.push('0', '1');
  if (fields.length === 5) fields.push('1');
  return fields.join(' ');
}

export function validateFenInput(raw: string): ImportResult<string> {
  if (raw.trim().length === 0) return { ok: false, error: 'Please paste a FEN string.' };
  const fen = normalizeFen(raw);
  const fieldCount = fen.split(' ').length;
  if (fieldCount !== 6) {
    return {
      ok: false,
      error: `A FEN has 6 space-separated fields, but ${fieldCount} were given.`,
    };
  }
  const validation = validateFen(fen);
  if (!validation.ok) {
    return { ok: false, error: `Invalid FEN: ${validation.error ?? 'unknown problem'}` };
  }
  const placement = fen.split(' ')[0] ?? '';
  const positionError = placementError(placement);
  if (positionError) return { ok: false, error: `Invalid position: ${positionError}` };
  if (opponentInCheck(fen)) {
    return {
      ok: false,
      error: 'Invalid position: the side that is not to move is in check.',
    };
  }
  return { ok: true, value: fen };
}

export function describeImportedGame(game: ImportedGame, index: number): string {
  const white = game.headers.White ?? 'White';
  const black = game.headers.Black ?? 'Black';
  const result = game.headers.Result ?? '*';
  const event = game.headers.Event && game.headers.Event !== '?' ? ` · ${game.headers.Event}` : '';
  const date =
    game.headers.Date && !game.headers.Date.startsWith('?') ? ` · ${game.headers.Date}` : '';
  return `${index + 1}. ${white} vs ${black} (${result})${event}${date}`;
}
