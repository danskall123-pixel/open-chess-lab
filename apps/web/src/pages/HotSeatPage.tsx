import { useState } from 'react';
import type { Color } from '@open-chess-lab/shared';
import { lastMoveSquares, oppositeColor } from '@open-chess-lab/shared';
import { ChessBoard } from '../components/ChessBoard';
import { GameOverBanner } from '../components/GameOverBanner';
import { LocalGameActions } from '../components/LocalGameActions';
import { MoveList } from '../components/MoveList';
import { useLocalGame } from '../hooks/useLocalGame';
import { useEngineGate } from '../state/session';

export function HotSeatPage() {
  const game = useLocalGame();
  const { allowed } = useEngineGate();
  const [autoFlip, setAutoFlip] = useState(false);
  const [manualOrientation, setManualOrientation] = useState<Color>('white');
  const orientation = autoFlip ? game.turn : manualOrientation;

  return (
    <div className="game-layout">
      <div className="board-column">
        <div className="player-bar">
          <span className="player-name">{orientation === 'white' ? 'Black' : 'White'}</span>
        </div>
        <ChessBoard
          fen={game.fen}
          orientation={orientation}
          movableColor={game.outcome ? null : 'both'}
          lastMove={lastMoveSquares(game.movesUci, game.movesUci.length)}
          onMove={game.play}
        />
        <div className="player-bar">
          <span className="player-name">{orientation === 'white' ? 'White' : 'Black'}</span>
        </div>
      </div>
      <aside className="side-column">
        <div className="panel compact">
          <h2>Local game</h2>
          <p className="muted small">
            {game.outcome ? 'Game over.' : `${game.turn === 'white' ? 'White' : 'Black'} to move.`}
          </p>
          <GameOverBanner outcome={game.outcome} />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={autoFlip}
              onChange={(event) => setAutoFlip(event.target.checked)}
            />
            Turn the board after every move
          </label>
        </div>
        <div className="panel compact">
          <MoveList sans={game.sans} currentPly={game.movesUci.length} onSelect={() => undefined} />
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => game.undo()}
              disabled={game.movesUci.length === 0}
            >
              Undo
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setManualOrientation((color) => oppositeColor(color))}
              disabled={autoFlip}
            >
              Flip board
            </button>
            <button type="button" className="button ghost" onClick={() => game.reset()}>
              New game
            </button>
          </div>
        </div>
        <div className="panel compact">
          <LocalGameActions
            initialFen={game.initialFen}
            movesUci={game.movesUci}
            fen={game.fen}
            headers={{ Event: 'Local game', White: 'White', Black: 'Black' }}
            outcome={game.outcome}
            analysisAllowed={allowed}
          />
        </div>
      </aside>
    </div>
  );
}
