import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import type { Color } from '@open-chess-lab/shared';
import { colorFromTurn, isPromotionMove, legalDestinations } from '@open-chess-lab/shared';
import { PromotionDialog } from './PromotionDialog';

export interface BoardArrow {
  from: string;
  to: string;
  brush: 'green' | 'red' | 'blue' | 'yellow';
}

export interface ChessBoardProps {
  fen: string;
  orientation: Color;
  movableColor: Color | 'both' | null;
  lastMove?: readonly string[] | null;
  arrows?: readonly BoardArrow[];
  onMove?: (uci: string) => void;
}

interface PendingPromotion {
  from: string;
  to: string;
  color: Color;
}

function toKey(square: string): Key {
  return square as Key;
}

function toDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const [from, targets] of legalDestinations(chess))
    dests.set(toKey(from), targets.map(toKey));
  return dests;
}

function boardConfig(props: ChessBoardProps, onMove: (from: string, to: string) => void): Config {
  const chess = new Chess(props.fen);
  const turn = colorFromTurn(chess.turn());
  const canMove = props.movableColor === 'both' || props.movableColor === turn;
  const shapes: DrawShape[] = (props.arrows ?? []).map((arrow) => ({
    orig: toKey(arrow.from),
    dest: toKey(arrow.to),
    brush: arrow.brush,
  }));
  return {
    fen: props.fen,
    orientation: props.orientation,
    turnColor: turn,
    check: chess.isCheck(),
    lastMove: props.lastMove ? props.lastMove.map(toKey) : undefined,
    coordinates: true,
    animation: { enabled: true, duration: 150 },
    highlight: { lastMove: true, check: true },
    movable: {
      free: false,
      color: canMove ? turn : undefined,
      dests: canMove ? toDests(chess) : new Map(),
      showDests: true,
      events: { after: (orig, dest) => onMove(orig, dest) },
    },
    premovable: { enabled: false },
    drawable: { enabled: true, autoShapes: shapes },
  };
}

export function ChessBoard(props: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  const propsRef = useRef(props);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);

  useEffect(() => {
    propsRef.current = props;
  });

  const handleMove = useRef((from: string, to: string) => {
    const current = propsRef.current;
    const chess = new Chess(current.fen);
    if (isPromotionMove(chess, from, to)) {
      setPromotion({ from, to, color: colorFromTurn(chess.turn()) });
      return;
    }
    current.onMove?.(`${from}${to}`);
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    apiRef.current = Chessground(element, boardConfig(propsRef.current, handleMove.current));
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    apiRef.current?.set(boardConfig(props, handleMove.current));
  }, [props]);

  const choosePromotion = (piece: string | null) => {
    const pending = promotion;
    setPromotion(null);
    if (!pending) return;
    if (piece === null) {
      apiRef.current?.set(boardConfig(propsRef.current, handleMove.current));
      return;
    }
    propsRef.current.onMove?.(`${pending.from}${pending.to}${piece}`);
  };

  return (
    <div className="board-frame">
      <div ref={containerRef} className="board" />
      {promotion && <PromotionDialog color={promotion.color} onChoose={choosePromotion} />}
    </div>
  );
}
