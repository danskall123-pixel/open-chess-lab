import type { Color } from '@open-chess-lab/shared';

const PIECES = [
  { code: 'q', name: 'Queen', white: '♕', black: '♛' },
  { code: 'r', name: 'Rook', white: '♖', black: '♜' },
  { code: 'b', name: 'Bishop', white: '♗', black: '♝' },
  { code: 'n', name: 'Knight', white: '♘', black: '♞' },
] as const;

export function PromotionDialog({
  color,
  onChoose,
}: {
  color: Color;
  onChoose: (piece: string | null) => void;
}) {
  return (
    <div className="promotion-overlay" role="dialog" aria-label="Choose a promotion piece">
      <div className="promotion-choices">
        {PIECES.map((piece) => (
          <button
            key={piece.code}
            type="button"
            className="promotion-choice"
            title={piece.name}
            onClick={() => onChoose(piece.code)}
          >
            {piece[color]}
          </button>
        ))}
        <button type="button" className="button ghost" onClick={() => onChoose(null)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
