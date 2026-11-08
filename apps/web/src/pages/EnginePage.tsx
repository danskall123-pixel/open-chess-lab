import { useEffect, useState } from 'react';
import type { Color } from '@open-chess-lab/shared';
import { lastMoveSquares, oppositeColor, resignationOutcome } from '@open-chess-lab/shared';
import type { GameOutcome } from '@open-chess-lab/shared';
import { ChessBoard } from '../components/ChessBoard';
import { EngineGateNotice } from '../components/EngineGateNotice';
import { GameOverBanner } from '../components/GameOverBanner';
import { LocalGameActions } from '../components/LocalGameActions';
import { MoveList } from '../components/MoveList';
import { ENGINE_LEVELS, engineLevel } from '../engine/levels';
import { engine } from '../engine/stockfish';
import { useLocalGame } from '../hooks/useLocalGame';
import { useEngineGate } from '../state/session';

type ColorChoice = Color | 'random';

interface EngineGameSettings {
  playerColor: Color;
  level: number;
}

function EngineSetup({ onStart }: { onStart: (settings: EngineGameSettings) => void }) {
  const [color, setColor] = useState<ColorChoice>('white');
  const [level, setLevel] = useState(3);
  const start = () => {
    const playerColor = color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color;
    onStart({ playerColor, level });
  };
  return (
    <section className="panel narrow">
      <h1>Play against Stockfish</h1>
      <p className="muted">Games against the computer are always unrated.</p>
      <div className="form">
        <fieldset className="segmented" aria-label="Your color">
          {(['white', 'random', 'black'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={color === option ? 'selected' : ''}
              onClick={() => setColor(option)}
            >
              {option === 'white' ? '♔ White' : option === 'black' ? '♚ Black' : '⚄ Random'}
            </button>
          ))}
        </fieldset>
        <div className="field">
          <span>Level</span>
          <div className="level-picker">
            {ENGINE_LEVELS.map((entry) => (
              <button
                key={entry.level}
                type="button"
                className={`level ${entry.level === level ? 'selected' : ''}`}
                onClick={() => setLevel(entry.level)}
                title={`Skill ${entry.skillLevel}, depth ${entry.depth}, ${entry.movetimeMs} ms`}
              >
                {entry.level}
              </button>
            ))}
          </div>
          <span className="muted small">
            Skill level {engineLevel(level).skillLevel}/20, searching up to depth{' '}
            {engineLevel(level).depth}.
          </span>
        </div>
        <button type="button" className="button primary" onClick={start}>
          Start game
        </button>
      </div>
    </section>
  );
}

function EngineGame({
  settings,
  onNewGame,
}: {
  settings: EngineGameSettings;
  onNewGame: () => void;
}) {
  const game = useLocalGame();
  const [orientation, setOrientation] = useState<Color>(settings.playerColor);
  const [resigned, setResigned] = useState<GameOutcome | null>(null);
  const [thinking, setThinking] = useState(false);
  const engineColor = oppositeColor(settings.playerColor);
  const outcome = resigned ?? game.outcome;
  const { play, fen, turn } = game;

  useEffect(() => {
    if (outcome || turn !== engineColor) return;
    const controller = new AbortController();
    const level = engineLevel(settings.level);
    setThinking(true);
    engine
      .search({
        fen,
        skillLevel: level.skillLevel,
        depth: level.depth,
        movetimeMs: level.movetimeMs,
        signal: controller.signal,
      })
      .then((result) => {
        if (!controller.signal.aborted && result.bestMove) play(result.bestMove);
      })
      .finally(() => !controller.signal.aborted && setThinking(false));
    return () => {
      controller.abort();
      setThinking(false);
    };
  }, [fen, turn, engineColor, outcome, settings.level, play]);

  const undo = () => {
    const plies = turn === settings.playerColor ? 2 : 1;
    game.undo(Math.min(plies, game.movesUci.length));
  };

  return (
    <div className="game-layout">
      <div className="board-column">
        <div className="player-bar">
          <span className="player-name">
            {orientation === engineColor ? `Stockfish level ${settings.level}` : 'You'}
          </span>
          {thinking && orientation === engineColor && <span className="muted">thinking…</span>}
        </div>
        <ChessBoard
          fen={game.fen}
          orientation={orientation}
          movableColor={outcome ? null : settings.playerColor}
          lastMove={lastMoveSquares(game.movesUci, game.movesUci.length)}
          onMove={game.play}
        />
        <div className="player-bar">
          <span className="player-name">
            {orientation === engineColor ? 'You' : `Stockfish level ${settings.level}`}
          </span>
          {thinking && orientation !== engineColor && <span className="muted">thinking…</span>}
        </div>
      </div>
      <aside className="side-column">
        <div className="panel compact">
          <h2>vs Stockfish · level {settings.level}</h2>
          <GameOverBanner outcome={outcome} />
        </div>
        <div className="panel compact">
          <MoveList sans={game.sans} currentPly={game.movesUci.length} onSelect={() => undefined} />
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={undo}
              disabled={game.movesUci.length === 0 || Boolean(resigned)}
            >
              Undo
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setOrientation((color) => oppositeColor(color))}
            >
              Flip board
            </button>
            <button
              type="button"
              className="button"
              disabled={Boolean(outcome)}
              onClick={() => setResigned(resignationOutcome(settings.playerColor))}
            >
              Resign
            </button>
            <button type="button" className="button ghost" onClick={onNewGame}>
              New game
            </button>
          </div>
        </div>
        <div className="panel compact">
          <LocalGameActions
            initialFen={game.initialFen}
            movesUci={game.movesUci}
            fen={game.fen}
            headers={{
              Event: 'Game against Stockfish',
              White: settings.playerColor === 'white' ? 'You' : `Stockfish level ${settings.level}`,
              Black: settings.playerColor === 'black' ? 'You' : `Stockfish level ${settings.level}`,
            }}
            outcome={outcome}
            analysisAllowed
          />
        </div>
      </aside>
    </div>
  );
}

export function EnginePage() {
  const { allowed, activeRatedGameId } = useEngineGate();
  const [settings, setSettings] = useState<EngineGameSettings | null>(null);
  const [gameNumber, setGameNumber] = useState(0);
  if (!allowed && activeRatedGameId) return <EngineGateNotice gameId={activeRatedGameId} />;
  if (!settings) return <EngineSetup onStart={setSettings} />;
  return (
    <EngineGame
      key={gameNumber}
      settings={settings}
      onNewGame={() => {
        setSettings(null);
        setGameNumber((value) => value + 1);
      }}
    />
  );
}
