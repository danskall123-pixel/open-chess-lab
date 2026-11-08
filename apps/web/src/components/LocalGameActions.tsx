import { useNavigate } from 'react-router';
import { buildPgn, resultOf } from '@open-chess-lab/shared';
import type { GameOutcome } from '@open-chess-lab/shared';
import { downloadText } from '../chess/exporting';
import { storeHandoffGame } from '../chess/handoff';
import { CopyButton } from './CopyButton';

export interface LocalGameActionsProps {
  initialFen: string;
  movesUci: string[];
  fen: string;
  headers: Record<string, string>;
  outcome: GameOutcome | null;
  analysisAllowed: boolean;
}

export function LocalGameActions({
  initialFen,
  movesUci,
  fen,
  headers,
  outcome,
  analysisAllowed,
}: LocalGameActionsProps) {
  const navigate = useNavigate();
  const pgn = buildPgn({
    initialFen,
    movesUci,
    headers: { ...headers, Result: outcome ? resultOf(outcome) : '*' },
  });
  const openIn = (path: string) => {
    storeHandoffGame({ initialFen, movesUci, headers });
    void navigate(path);
  };
  return (
    <div className="button-row">
      {analysisAllowed && (
        <>
          <button type="button" className="button" onClick={() => openIn('/analysis?from=handoff')}>
            Analyze
          </button>
          {movesUci.length > 0 && (
            <button type="button" className="button" onClick={() => openIn('/review/imported')}>
              Review
            </button>
          )}
        </>
      )}
      <button type="button" className="button ghost" onClick={() => downloadText('game.pgn', pgn)}>
        Download PGN
      </button>
      <CopyButton text={pgn} label="Copy PGN" />
      <CopyButton text={fen} label="Copy FEN" />
    </div>
  );
}
