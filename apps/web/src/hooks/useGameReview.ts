import { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import type { GameReview, PositionEvaluation } from '@open-chess-lab/shared';
import { colorFromTurn, reviewGame, terminalEvaluation, tryMove } from '@open-chess-lab/shared';
import { engine } from '../engine/stockfish';

const REVIEW_DEPTH = 14;
const reviewCache = new Map<string, GameReview>();

export interface ReviewProgress {
  review: GameReview | null;
  analyzed: number;
  total: number;
  error: string | null;
}

function positionsOf(initialFen: string, movesUci: readonly string[]): Chess[] {
  const chess = new Chess(initialFen);
  const positions = [new Chess(chess.fen())];
  for (const uci of movesUci) {
    if (!tryMove(chess, uci)) break;
    positions.push(new Chess(chess.fen()));
  }
  return positions;
}

export function useGameReview(
  initialFen: string,
  movesUci: readonly string[],
  enabled: boolean,
): ReviewProgress {
  const cacheKey = `${initialFen}|${movesUci.join(' ')}`;
  const cached = reviewCache.get(cacheKey) ?? null;
  const [progress, setProgress] = useState<ReviewProgress>({
    review: cached,
    analyzed: cached ? movesUci.length + 1 : 0,
    total: movesUci.length + 1,
    error: null,
  });

  useEffect(() => {
    const done = reviewCache.get(cacheKey);
    if (done || !enabled) {
      if (done)
        setProgress({
          review: done,
          analyzed: movesUci.length + 1,
          total: movesUci.length + 1,
          error: null,
        });
      return;
    }
    const controller = new AbortController();
    const positions = positionsOf(initialFen, movesUci);
    const run = async () => {
      const evaluations: PositionEvaluation[] = [];
      for (const position of positions) {
        if (controller.signal.aborted) return;
        const terminal = terminalEvaluation(position);
        if (terminal) {
          evaluations.push(terminal);
        } else {
          const result = await engine.search({
            fen: position.fen(),
            depth: REVIEW_DEPTH,
            signal: controller.signal,
          });
          const best = result.lines[0];
          evaluations.push({
            score: best?.score ?? { kind: 'cp', value: 0 },
            bestMoveUci: result.bestMove,
          });
        }
        setProgress((current) => ({
          ...current,
          analyzed: evaluations.length,
          total: positions.length,
        }));
      }
      if (controller.signal.aborted) return;
      const firstMover = colorFromTurn(new Chess(initialFen).turn());
      const review = reviewGame({
        firstMover,
        movesUci: movesUci.slice(0, positions.length - 1),
        evaluations,
      });
      reviewCache.set(cacheKey, review);
      setProgress({ review, analyzed: positions.length, total: positions.length, error: null });
    };
    run().catch(() =>
      setProgress((current) => ({ ...current, error: 'The engine could not finish the review.' })),
    );
    return () => controller.abort();
  }, [cacheKey, enabled, initialFen, movesUci]);

  return progress;
}
