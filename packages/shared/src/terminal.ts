import type { Chess } from 'chess.js';
import { colorFromTurn, oppositeColor } from './color.js';
import type { PositionEvaluation } from './review.js';
import { CENTIPAWN_CAP } from './review.js';

export function terminalEvaluation(chess: Chess): PositionEvaluation | null {
  if (chess.isCheckmate()) {
    const winner = oppositeColor(colorFromTurn(chess.turn()));
    return {
      score: { kind: 'cp', value: winner === 'white' ? CENTIPAWN_CAP : -CENTIPAWN_CAP },
      bestMoveUci: null,
    };
  }
  if (chess.isDraw()) return { score: { kind: 'cp', value: 0 }, bestMoveUci: null };
  return null;
}
