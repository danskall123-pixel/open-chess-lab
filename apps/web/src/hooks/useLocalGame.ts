import { useCallback, useMemo, useState } from 'react';
import type { Color, GameOutcome } from '@open-chess-lab/shared';
import {
  STANDARD_START_FEN,
  colorFromTurn,
  detectPositionOutcome,
  replayUciMoves,
  tryMove,
} from '@open-chess-lab/shared';

export interface LocalGame {
  initialFen: string;
  movesUci: string[];
  sans: string[];
  fen: string;
  turn: Color;
  outcome: GameOutcome | null;
  play: (uci: string) => boolean;
  undo: (plies?: number) => void;
  reset: (fen?: string) => void;
}

export function useLocalGame(startFen: string = STANDARD_START_FEN): LocalGame {
  const [initialFen, setInitialFen] = useState(startFen);
  const [movesUci, setMovesUci] = useState<string[]>([]);

  const derived = useMemo(() => {
    const chess = replayUciMoves(initialFen, movesUci);
    return {
      fen: chess.fen(),
      sans: chess.history(),
      turn: colorFromTurn(chess.turn()),
      outcome: detectPositionOutcome(chess),
    };
  }, [initialFen, movesUci]);

  const play = useCallback(
    (uci: string) => {
      const chess = replayUciMoves(initialFen, movesUci);
      if (detectPositionOutcome(chess) || !tryMove(chess, uci)) return false;
      setMovesUci((current) => [...current, uci]);
      return true;
    },
    [initialFen, movesUci],
  );

  const undo = useCallback(
    (plies = 1) => setMovesUci((current) => current.slice(0, Math.max(0, current.length - plies))),
    [],
  );

  const reset = useCallback((fen: string = STANDARD_START_FEN) => {
    setInitialFen(fen);
    setMovesUci([]);
  }, []);

  return { initialFen, movesUci, ...derived, play, undo, reset };
}
