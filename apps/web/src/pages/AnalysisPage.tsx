import { useCallback, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { Color } from '@open-chess-lab/shared';
import {
  STANDARD_START_FEN,
  colorFromTurn,
  oppositeColor,
  parseUci,
  validateFenInput,
} from '@open-chess-lab/shared';
import type { VariationTree } from '../chess/variationTree';
import {
  addMove,
  createTree,
  deleteVariation,
  mainlineFrom,
  nodeOf,
  pathTo,
  promoteVariation,
  treeToPgn,
} from '../chess/variationTree';
import { downloadText } from '../chess/exporting';
import { loadHandoffGame } from '../chess/handoff';
import { ChessBoard } from '../components/ChessBoard';
import { CopyButton } from '../components/CopyButton';
import { EngineGateNotice } from '../components/EngineGateNotice';
import { EngineLines } from '../components/EngineLines';
import { EvalBar } from '../components/EvalBar';
import { useArrowKeys } from '../components/NavigationButtons';
import { VariationView } from '../components/VariationView';
import { useAnalysis } from '../hooks/useAnalysis';
import { useEngineGate } from '../state/session';

interface AnalysisState {
  tree: VariationTree;
  currentId: string;
}

function initialState(): AnalysisState {
  const params = new URLSearchParams(window.location.search);
  const fenParam = params.get('fen');
  if (fenParam) {
    const fen = validateFenInput(fenParam);
    if (fen.ok) return { tree: createTree(fen.value), currentId: 'root' };
  }
  const handoff = params.get('from') === 'handoff' ? loadHandoffGame() : null;
  if (handoff) {
    const tree = createTree(handoff.initialFen, handoff.movesUci);
    const line = mainlineFrom(tree, tree.rootId);
    const target = line[Math.min(line.length - 1, handoff.startPly ?? line.length - 1)];
    return { tree, currentId: target?.id ?? tree.rootId };
  }
  return { tree: createTree(STANDARD_START_FEN), currentId: 'root' };
}

function AnalysisBoard() {
  const [state, setState] = useState<AnalysisState>(initialState);
  const [orientation, setOrientation] = useState<Color>('white');
  const [engineOn, setEngineOn] = useState(true);
  const [fenInput, setFenInput] = useState('');
  const [fenError, setFenError] = useState<string | null>(null);
  const current = nodeOf(state.tree, state.currentId);
  const lines = useAnalysis(current.fen, engineOn);
  const bestLine = lines[0];
  const terminal = useMemo(() => new Chess(current.fen).isGameOver(), [current.fen]);

  const playMove = useCallback((uci: string) => {
    setState((previous) => {
      const result = addMove(previous.tree, previous.currentId, uci);
      return result ? { tree: result.tree, currentId: result.nodeId } : previous;
    });
  }, []);

  const step = useCallback((delta: number | 'start' | 'end') => {
    setState((previous) => {
      const node = nodeOf(previous.tree, previous.currentId);
      if (delta === 'start') return { ...previous, currentId: previous.tree.rootId };
      if (delta === 'end') {
        const line = mainlineFrom(previous.tree, previous.currentId);
        return { ...previous, currentId: line[line.length - 1]?.id ?? previous.currentId };
      }
      if (delta < 0) return { ...previous, currentId: node.parentId ?? previous.currentId };
      return { ...previous, currentId: node.children[0] ?? previous.currentId };
    });
  }, []);
  useArrowKeys(step);

  const loadFen = () => {
    const result = validateFenInput(fenInput);
    if (!result.ok) {
      setFenError(result.error);
      return;
    }
    setFenError(null);
    setState({ tree: createTree(result.value), currentId: 'root' });
    setOrientation(colorFromTurn(result.value.split(' ')[1] === 'b' ? 'b' : 'w'));
  };

  const lastMove = current.uci ? parseUci(current.uci) : null;
  const bestMove = bestLine?.pv[0] ? parseUci(bestLine.pv[0]) : null;
  const pgn = treeToPgn(state.tree, {}, STANDARD_START_FEN);
  const pathLength = pathTo(state.tree, state.currentId).length - 1;

  return (
    <div className="game-layout analysis">
      <div className="board-column with-eval">
        {engineOn && (
          <EvalBar score={terminal ? null : (bestLine?.score ?? null)} orientation={orientation} />
        )}
        <ChessBoard
          fen={current.fen}
          orientation={orientation}
          movableColor="both"
          lastMove={lastMove ? [lastMove.from, lastMove.to] : null}
          arrows={
            engineOn && bestMove ? [{ from: bestMove.from, to: bestMove.to, brush: 'blue' }] : []
          }
          onMove={playMove}
        />
      </div>
      <aside className="side-column">
        <div className="panel compact">
          <div className="panel-header">
            <h2>Stockfish</h2>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={engineOn}
                onChange={(event) => setEngineOn(event.target.checked)}
              />
              Engine
            </label>
          </div>
          {engineOn &&
            (terminal ? (
              <p className="muted">The game is over in this position.</p>
            ) : (
              <EngineLines fen={current.fen} lines={lines} onPlay={playMove} />
            ))}
        </div>
        <div className="panel compact">
          <VariationView
            tree={state.tree}
            currentId={state.currentId}
            onSelect={(currentId) => setState((previous) => ({ ...previous, currentId }))}
          />
          <div className="button-row">
            <button
              type="button"
              className="button"
              onClick={() => step('start')}
              aria-label="Start"
            >
              ⏮
            </button>
            <button type="button" className="button" onClick={() => step(-1)} aria-label="Back">
              ◀
            </button>
            <button type="button" className="button" onClick={() => step(1)} aria-label="Forward">
              ▶
            </button>
            <button type="button" className="button" onClick={() => step('end')} aria-label="End">
              ⏭
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setOrientation((color) => oppositeColor(color))}
              aria-label="Flip board"
            >
              ⇅
            </button>
          </div>
          {pathLength > 0 && (
            <div className="button-row">
              <button
                type="button"
                className="button ghost"
                onClick={() =>
                  setState((previous) => ({
                    ...previous,
                    tree: promoteVariation(previous.tree, previous.currentId),
                  }))
                }
              >
                Make main line
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() =>
                  setState((previous) => ({
                    tree: deleteVariation(previous.tree, previous.currentId),
                    currentId:
                      nodeOf(previous.tree, previous.currentId).parentId ?? previous.tree.rootId,
                  }))
                }
              >
                Delete from here
              </button>
            </div>
          )}
        </div>
        <div className="panel compact">
          <label className="field">
            <span>FEN</span>
            <input readOnly value={current.fen} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <div className="button-row">
            <CopyButton text={current.fen} label="Copy FEN" />
            <CopyButton text={pgn} label="Copy PGN" />
            <button
              type="button"
              className="button ghost"
              onClick={() => downloadText('analysis.pgn', pgn)}
            >
              Download PGN
            </button>
          </div>
          <label className="field">
            <span>Set up a position</span>
            <input
              value={fenInput}
              placeholder="Paste a FEN"
              onChange={(event) => setFenInput(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button type="button" className="button" onClick={loadFen}>
              Load FEN
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setState({ tree: createTree(STANDARD_START_FEN), currentId: 'root' })}
            >
              Reset board
            </button>
          </div>
          {fenError && <p className="error-text">{fenError}</p>}
        </div>
      </aside>
    </div>
  );
}

export function AnalysisPage() {
  const { allowed, activeRatedGameId } = useEngineGate();
  if (!allowed && activeRatedGameId) return <EngineGateNotice gameId={activeRatedGameId} />;
  return <AnalysisBoard />;
}
