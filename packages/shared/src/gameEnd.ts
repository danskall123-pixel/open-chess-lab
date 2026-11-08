import type { Chess } from 'chess.js';
import type { Color } from './color.js';
import { colorFromTurn, oppositeColor } from './color.js';

export type Termination =
  | 'checkmate'
  | 'resignation'
  | 'timeout'
  | 'stalemate'
  | 'threefold-repetition'
  | 'fifty-move-rule'
  | 'insufficient-material'
  | 'timeout-vs-insufficient-material'
  | 'agreement'
  | 'abandonment';

export interface GameOutcome {
  winner: Color | null;
  termination: Termination;
}

export type GameResult = '1-0' | '0-1' | '1/2-1/2';

export type Score = 0 | 0.5 | 1;

const HEAVY_OR_PAWN_TYPES = new Set(['p', 'r', 'q']);

function piecesOf(chess: Chess, color: Color): string[] {
  const code = color === 'white' ? 'w' : 'b';
  return chess
    .board()
    .flat()
    .filter((square) => square !== null && square.color === code && square.type !== 'k')
    .map((square) => (square as { type: string }).type);
}

export function hasMatingMaterial(chess: Chess, color: Color): boolean {
  const own = piecesOf(chess, color);
  if (own.length === 0) return false;
  if (own.some((type) => HEAVY_OR_PAWN_TYPES.has(type))) return true;
  if (own.length >= 2) return true;
  return piecesOf(chess, oppositeColor(color)).length > 0;
}

export function detectPositionOutcome(chess: Chess): GameOutcome | null {
  if (chess.isCheckmate()) {
    return { winner: oppositeColor(colorFromTurn(chess.turn())), termination: 'checkmate' };
  }
  if (chess.isStalemate()) return { winner: null, termination: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { winner: null, termination: 'insufficient-material' };
  if (chess.isThreefoldRepetition()) return { winner: null, termination: 'threefold-repetition' };
  if (chess.isDrawByFiftyMoves()) return { winner: null, termination: 'fifty-move-rule' };
  return null;
}

export function timeoutOutcome(chess: Chess, flagged: Color): GameOutcome {
  const opponent = oppositeColor(flagged);
  if (!hasMatingMaterial(chess, opponent)) {
    return { winner: null, termination: 'timeout-vs-insufficient-material' };
  }
  return { winner: opponent, termination: 'timeout' };
}

export function resignationOutcome(resigning: Color): GameOutcome {
  return { winner: oppositeColor(resigning), termination: 'resignation' };
}

export function abandonmentOutcome(absent: Color): GameOutcome {
  return { winner: oppositeColor(absent), termination: 'abandonment' };
}

export function agreementOutcome(): GameOutcome {
  return { winner: null, termination: 'agreement' };
}

export function resultOf(outcome: GameOutcome): GameResult {
  if (outcome.winner === 'white') return '1-0';
  if (outcome.winner === 'black') return '0-1';
  return '1/2-1/2';
}

export function scoreFor(outcome: GameOutcome, color: Color): Score {
  if (outcome.winner === null) return 0.5;
  return outcome.winner === color ? 1 : 0;
}

const TERMINATION_LABELS: Record<Termination, string> = {
  checkmate: 'Checkmate',
  resignation: 'Resignation',
  timeout: 'Time out',
  stalemate: 'Stalemate',
  'threefold-repetition': 'Threefold repetition',
  'fifty-move-rule': 'Fifty-move rule',
  'insufficient-material': 'Insufficient material',
  'timeout-vs-insufficient-material': 'Time out with insufficient mating material',
  agreement: 'Draw by agreement',
  abandonment: 'Opponent left the game',
};

export function describeTermination(termination: Termination): string {
  return TERMINATION_LABELS[termination];
}

export function describeOutcome(outcome: GameOutcome): string {
  const label = describeTermination(outcome.termination);
  if (outcome.winner === null) return `Draw · ${label}`;
  const winner = outcome.winner === 'white' ? 'White' : 'Black';
  return `${winner} wins · ${label}`;
}

export function isTermination(value: unknown): value is Termination {
  return typeof value === 'string' && value in TERMINATION_LABELS;
}
