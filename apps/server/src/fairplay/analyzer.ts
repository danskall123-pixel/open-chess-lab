import { Chess } from 'chess.js';
import type { GameReview, PositionEvaluation } from '@open-chess-lab/shared';
import {
  CENTIPAWN_CAP,
  colorFromTurn,
  oppositeColor,
  reviewGame,
  tryMove,
} from '@open-chess-lab/shared';

export interface PositionEvaluator {
  evaluate(fen: string): Promise<PositionEvaluation>;
}

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

export async function analyzeGame(
  initialFen: string,
  movesUci: readonly string[],
  evaluator: PositionEvaluator,
): Promise<GameReview> {
  const chess = new Chess(initialFen);
  const firstMover = colorFromTurn(chess.turn());
  const evaluations: PositionEvaluation[] = [];
  const evaluateCurrent = async () =>
    terminalEvaluation(chess) ?? (await evaluator.evaluate(chess.fen()));

  evaluations.push(await evaluateCurrent());
  for (const uci of movesUci) {
    if (!tryMove(chess, uci)) throw new Error(`Illegal move ${uci} during analysis`);
    evaluations.push(await evaluateCurrent());
  }
  return reviewGame({ firstMover, movesUci, evaluations });
}
