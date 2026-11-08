import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Color, GameReview, MoveClassification, PlyReview } from '@open-chess-lab/shared';
import {
  MOVE_CLASSIFICATIONS,
  lastMoveSquares,
  oppositeColor,
  parseUci,
  positionAfter,
  sanMoves,
  winPercent,
} from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import type { HandoffGame } from '../chess/handoff';
import { IMPORTED_GAME_ID, loadHandoffGame, storeHandoffGame } from '../chess/handoff';
import { pvToSan } from '../engine/uci';
import type { BoardArrow } from '../components/ChessBoard';
import { ChessBoard } from '../components/ChessBoard';
import { EngineGateNotice } from '../components/EngineGateNotice';
import { EvalBar } from '../components/EvalBar';
import { LineChart } from '../components/LineChart';
import type { ChartPoint } from '../components/LineChart';
import { MoveList } from '../components/MoveList';
import { NavigationButtons } from '../components/NavigationButtons';
import { useGameReview } from '../hooks/useGameReview';
import { usePly } from '../hooks/usePly';
import { useEngineGate } from '../state/session';

const CLASSIFICATION_LABELS: Record<MoveClassification, string> = {
  best: 'Best',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
};

const NEEDS_BETTER_MOVE = new Set<MoveClassification>(['inaccuracy', 'mistake', 'blunder']);

function formatPawns(centipawns: number): string {
  const pawns = centipawns / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

function advantage(centipawns: number): number {
  return winPercent(centipawns) * 2 - 100;
}

function advantageTick(value: number): string {
  if (value >= 100) return 'White';
  if (value <= -100) return 'Black';
  return value === 0 ? '=' : '';
}

function evalPoints(review: GameReview, sans: readonly string[]): ChartPoint[] {
  const startCp = review.plies[0]?.evalBeforeCp ?? 0;
  const start: ChartPoint = {
    label: 'Start',
    value: advantage(startCp),
    valueLabel: formatPawns(startCp),
  };
  return [
    start,
    ...review.plies.map((ply, index) => {
      const moveNumber = Math.floor(index / 2) + 1;
      const marker: ChartPoint['marker'] =
        ply.classification === 'blunder'
          ? 'critical'
          : ply.classification === 'mistake'
            ? 'warning'
            : undefined;
      return {
        label: `${moveNumber}${ply.mover === 'white' ? '.' : '…'} ${sans[index] ?? ''}`,
        value: advantage(ply.evalAfterCp),
        valueLabel: `${formatPawns(ply.evalAfterCp)} · ${CLASSIFICATION_LABELS[ply.classification]}`,
        ...(marker ? { marker } : {}),
      };
    }),
  ];
}

function PlayerSummary({
  review,
  color,
  name,
}: {
  review: GameReview;
  color: Color;
  name: string;
}) {
  return (
    <div className="review-summary">
      <div className="review-summary-head">
        <strong>{name}</strong>
        <span className="accuracy">{review.accuracy[color] ?? '–'}%</span>
      </div>
      <span className="muted small">
        Average centipawn loss {review.averageCentipawnLoss[color] ?? '–'}
      </span>
      <div className="classification-counts">
        {MOVE_CLASSIFICATIONS.map((classification) => (
          <span key={classification} className={`count mark-${classification}`}>
            {CLASSIFICATION_LABELS[classification]} {review.counts[color][classification]}
          </span>
        ))}
      </div>
    </div>
  );
}

function CurrentMove({ ply, fenBefore, san }: { ply: PlyReview; fenBefore: string; san: string }) {
  const better =
    ply.bestUci && ply.bestUci !== ply.playedUci ? pvToSan(fenBefore, [ply.bestUci])[0] : null;
  return (
    <div className={`current-move mark-${ply.classification}`}>
      <strong>
        {san} is {CLASSIFICATION_LABELS[ply.classification].toLowerCase()}
      </strong>
      <span className="muted small">
        Evaluation {formatPawns(ply.evalBeforeCp)} → {formatPawns(ply.evalAfterCp)} · loss{' '}
        {ply.centipawnLoss} cp
      </span>
      {better && NEEDS_BETTER_MOVE.has(ply.classification) && <span>Better was {better}.</span>}
    </div>
  );
}

function ReviewBoard({ game, title }: { game: HandoffGame; title: string }) {
  const navigate = useNavigate();
  const movesUci = game.movesUci;
  const { review, analyzed, total, error } = useGameReview(game.initialFen, movesUci, true);
  const sans = useMemo(() => sanMoves(game.initialFen, movesUci), [game.initialFen, movesUci]);
  const [orientation, setOrientation] = useState<Color>('white');
  const [ply, setPly] = usePly(movesUci.length, false);
  const fen = useMemo(
    () => positionAfter(game.initialFen, movesUci, ply),
    [game.initialFen, movesUci, ply],
  );
  const fenBefore = useMemo(
    () => positionAfter(game.initialFen, movesUci, Math.max(0, ply - 1)),
    [game.initialFen, movesUci, ply],
  );
  const current = ply > 0 ? review?.plies[ply - 1] : undefined;
  const points = useMemo(() => (review ? evalPoints(review, sans) : []), [review, sans]);

  const arrows: BoardArrow[] = [];
  if (current && current.bestUci && NEEDS_BETTER_MOVE.has(current.classification)) {
    const best = parseUci(current.bestUci);
    if (best) arrows.push({ from: best.from, to: best.to, brush: 'green' });
  }
  const currentEval = ply === 0 ? review?.plies[0]?.evalBeforeCp : current?.evalAfterCp;

  const openInAnalysis = () => {
    storeHandoffGame({ ...game, startPly: ply });
    void navigate('/analysis?from=handoff');
  };

  return (
    <div className="game-layout">
      <div className="board-column with-eval">
        <EvalBar
          score={currentEval === undefined ? null : { kind: 'cp', value: currentEval }}
          orientation={orientation}
        />
        <ChessBoard
          fen={fen}
          orientation={orientation}
          movableColor={null}
          lastMove={lastMoveSquares(movesUci, ply)}
          arrows={arrows}
        />
      </div>
      <aside className="side-column">
        <div className="panel compact">
          <h2>{title}</h2>
          {!review && !error && (
            <div
              className="progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={analyzed}
            >
              <div
                className="progress-fill"
                style={{ width: `${(analyzed / Math.max(1, total)) * 100}%` }}
              />
              <span>
                Analyzing position {analyzed} of {total}…
              </span>
            </div>
          )}
          {error && <p className="error-text">{error}</p>}
          {review && (
            <div className="review-summaries">
              <PlayerSummary review={review} color="white" name={game.headers.White ?? 'White'} />
              <PlayerSummary review={review} color="black" name={game.headers.Black ?? 'Black'} />
            </div>
          )}
        </div>
        {review && (
          <div className="panel compact">
            <LineChart
              points={points}
              ariaLabel="Evaluation across the game, from White's point of view"
              yDomain={[-100, 100]}
              baseline={0}
              fillToBaseline
              selectedIndex={ply}
              onSelect={setPly}
              formatTick={advantageTick}
              height={150}
            />
          </div>
        )}
        <div className="panel compact">
          {current && <CurrentMove ply={current} fenBefore={fenBefore} san={sans[ply - 1] ?? ''} />}
          <MoveList
            sans={sans}
            currentPly={ply}
            onSelect={setPly}
            annotations={review?.plies.map((entry) => entry.classification)}
            blackMovesFirst={game.initialFen.split(' ')[1] === 'b'}
            firstMoveNumber={Number(game.initialFen.split(' ')[5] ?? '1')}
          />
          <NavigationButtons
            ply={ply}
            maxPly={movesUci.length}
            onChange={setPly}
            onFlip={() => setOrientation((color) => oppositeColor(color))}
          />
          <p className="muted small">Use the arrow keys to step through the moves.</p>
          <button type="button" className="button" onClick={openInAnalysis}>
            Explore this position
          </button>
        </div>
      </aside>
    </div>
  );
}

function useReviewSource(id: string): {
  game: HandoffGame | null;
  title: string;
  error: string | null;
} {
  const [state, setState] = useState<{
    game: HandoffGame | null;
    title: string;
    error: string | null;
  }>(() => {
    if (id !== IMPORTED_GAME_ID) return { game: null, title: 'Game review', error: null };
    const handoff = loadHandoffGame();
    return handoff
      ? { game: handoff, title: 'Imported game review', error: null }
      : { game: null, title: 'Game review', error: 'No imported game found. Import a PGN first.' };
  });

  useEffect(() => {
    if (id === IMPORTED_GAME_ID) return;
    let cancelled = false;
    endpoints
      .game(id)
      .then((result) => {
        if (cancelled) return;
        if (result.live) {
          setState({ game: null, title: 'Game review', error: 'This game is still being played.' });
          return;
        }
        const record = result.record;
        setState({
          game: {
            initialFen: record.initialFen,
            movesUci: record.movesUci,
            headers: { White: record.players.white.name, Black: record.players.black.name },
          },
          title: `${record.players.white.name} vs ${record.players.black.name}`,
          error: null,
        });
      })
      .catch(
        (caught: unknown) =>
          !cancelled && setState({ game: null, title: 'Game review', error: errorText(caught) }),
      );
    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}

export function ReviewPage() {
  const { id = '' } = useParams();
  const { allowed, activeRatedGameId } = useEngineGate();
  const { game, title, error } = useReviewSource(id);
  if (!allowed && activeRatedGameId) return <EngineGateNotice gameId={activeRatedGameId} />;
  if (error) {
    return (
      <section className="panel narrow">
        <p className="error-text">{error}</p>
        <Link to="/import">Import a game</Link>
      </section>
    );
  }
  if (!game) return <section className="panel narrow">Loading game…</section>;
  if (game.movesUci.length === 0)
    return <section className="panel narrow">This game has no moves to review.</section>;
  return <ReviewBoard game={game} title={title} />;
}
