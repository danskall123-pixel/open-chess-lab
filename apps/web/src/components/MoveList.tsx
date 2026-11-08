import { useEffect, useRef } from 'react';
import type { MoveClassification } from '@open-chess-lab/shared';

export interface MoveListProps {
  sans: readonly string[];
  currentPly: number;
  onSelect: (ply: number) => void;
  firstMoveNumber?: number;
  blackMovesFirst?: boolean;
  annotations?: readonly (MoveClassification | null)[];
}

const ANNOTATION_SYMBOLS: Record<MoveClassification, string> = {
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

interface MoveCell {
  ply: number;
  san: string;
}

interface MoveRow {
  number: number;
  white: MoveCell | null;
  black: MoveCell | null;
}

function buildRows(
  sans: readonly string[],
  firstMoveNumber: number,
  blackMovesFirst: boolean,
): MoveRow[] {
  const rows: MoveRow[] = [];
  const offset = blackMovesFirst ? 1 : 0;
  sans.forEach((san, index) => {
    const slot = index + offset;
    const rowIndex = Math.floor(slot / 2);
    const row = (rows[rowIndex] ??= {
      number: firstMoveNumber + rowIndex,
      white: null,
      black: null,
    });
    const cell = { ply: index + 1, san };
    if (slot % 2 === 0) row.white = cell;
    else row.black = cell;
  });
  return rows;
}

export function MoveList({
  sans,
  currentPly,
  onSelect,
  firstMoveNumber = 1,
  blackMovesFirst = false,
  annotations,
}: MoveListProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [currentPly]);

  const renderCell = (cell: MoveCell | null) => {
    if (!cell) return <span className="move-cell empty">…</span>;
    const annotation = annotations?.[cell.ply - 1] ?? null;
    const active = cell.ply === currentPly;
    return (
      <button
        type="button"
        ref={active ? activeRef : undefined}
        className={`move-cell ${active ? 'active' : ''} ${annotation ? `mark-${annotation}` : ''}`}
        onClick={() => onSelect(cell.ply)}
      >
        {cell.san}
        {annotation && ANNOTATION_SYMBOLS[annotation]}
      </button>
    );
  };

  if (sans.length === 0) return <div className="move-list empty-state">No moves yet.</div>;
  return (
    <div className="move-list" role="list">
      {buildRows(sans, firstMoveNumber, blackMovesFirst).map((row) => (
        <div className="move-row" role="listitem" key={row.number}>
          <span className="move-number">{row.number}.</span>
          {renderCell(row.white)}
          {renderCell(row.black)}
        </div>
      ))}
    </div>
  );
}
