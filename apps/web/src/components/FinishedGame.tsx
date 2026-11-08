import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { Color, GamePlayerView, GameRecord } from '@open-chess-lab/shared';
import {
  describeTermination,
  formatTimeControl,
  lastMoveSquares,
  oppositeColor,
  positionAfter,
  sanMoves,
} from '@open-chess-lab/shared';
import { downloadText } from '../chess/exporting';
import { storeHandoffGame } from '../chess/handoff';
import { ChessBoard } from './ChessBoard';
import { CopyButton } from './CopyButton';
import { MoveList } from './MoveList';
import { NavigationButtons } from './NavigationButtons';
import { PlayerBar } from './PlayerBar';
import { usePly } from '../hooks/usePly';

function playerView(record: GameRecord, color: Color): GamePlayerView {
  const player = record.players[color];
  return {
    key: player.userId ?? player.name,
    userId: player.userId,
    name: player.name,
    isGuest: player.userId === null,
    rating: player.rating,
    provisional: false,
    connected: true,
  };
}

function resultLabel(record: GameRecord): string {
  if (record.status === 'aborted') return 'Game aborted';
  const termination = record.termination ? describeTermination(record.termination) : '';
  if (record.result === '1/2-1/2') return `Draw · ${termination}`;
  if (record.result === '1-0') return `White wins · ${termination}`;
  if (record.result === '0-1') return `Black wins · ${termination}`;
  return 'Unfinished';
}

export function FinishedGame({ record }: { record: GameRecord }) {
  const navigate = useNavigate();
  const [orientation, setOrientation] = useState<Color>('white');
  const sans = useMemo(() => sanMoves(record.initialFen, record.movesUci), [record]);
  const maxPly = record.movesUci.length;
  const [ply, setPly] = usePly(maxPly);
  const fen = useMemo(() => positionAfter(record.initialFen, record.movesUci, ply), [record, ply]);

  const openInAnalysis = () => {
    storeHandoffGame({
      initialFen: record.initialFen,
      movesUci: record.movesUci,
      headers: {},
      startPly: ply,
    });
    void navigate('/analysis?from=handoff');
  };

  return (
    <div className="game-layout">
      <div className="board-column">
        <PlayerBar
          player={playerView(record, oppositeColor(orientation))}
          ratingChange={record.players[oppositeColor(orientation)].ratingChange}
        />
        <ChessBoard
          fen={fen}
          orientation={orientation}
          movableColor={null}
          lastMove={lastMoveSquares(record.movesUci, ply)}
        />
        <PlayerBar
          player={playerView(record, orientation)}
          ratingChange={record.players[orientation].ratingChange}
        />
      </div>
      <aside className="side-column">
        <div className="panel compact">
          <strong>
            {formatTimeControl(record.timeControl)} · {record.rated ? 'Rated' : 'Casual'}{' '}
            {record.speed}
          </strong>
          <div className="result-banner">{resultLabel(record)}</div>
          <span className="muted small">{new Date(record.startedAt).toLocaleString()}</span>
        </div>
        <div className="panel compact">
          <MoveList sans={sans} currentPly={ply} onSelect={setPly} />
          <NavigationButtons
            ply={ply}
            maxPly={maxPly}
            onChange={setPly}
            onFlip={() => setOrientation((color) => oppositeColor(color))}
          />
        </div>
        <div className="panel compact button-row">
          {record.status === 'finished' && (
            <Link className="button primary" to={`/review/${record.id}`}>
              Review game
            </Link>
          )}
          <button type="button" className="button" onClick={openInAnalysis}>
            Open in analysis
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => downloadText(`${record.id}.pgn`, record.pgn)}
          >
            Download PGN
          </button>
          <CopyButton text={record.pgn} label="Copy PGN" />
          <CopyButton text={fen} label="Copy FEN" />
        </div>
      </aside>
    </div>
  );
}
