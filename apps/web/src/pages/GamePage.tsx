import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { ClientMessage, Color, GameRecord, GameView } from '@open-chess-lab/shared';
import {
  describeOutcome,
  formatTimeControl,
  lastMoveSquares,
  oppositeColor,
  positionAfter,
} from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import { ChessBoard } from '../components/ChessBoard';
import { Clock } from '../components/Clock';
import { MoveList } from '../components/MoveList';
import { NavigationButtons } from '../components/NavigationButtons';
import { PlayerBar, RatingChange } from '../components/PlayerBar';
import { FinishedGame } from '../components/FinishedGame';
import { usePly } from '../hooks/usePly';
import { useSession } from '../state/session';

interface LiveState {
  game: GameView;
  receivedAt: number;
}

function useLiveGame(gameId: string, initial: GameView | null) {
  const { socket } = useSession();
  const [state, setState] = useState<LiveState | null>(
    initial ? { game: initial, receivedAt: performance.now() } : null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) return;
    const unwatch = socket.watchGame(gameId);
    const unsubscribe = socket.subscribe((message) => {
      if (message.t === 'game.state' && message.game.id === gameId) {
        setState({ game: message.game, receivedAt: performance.now() });
      }
      if (message.t === 'error') setNotice(message.message);
    });
    return () => {
      unsubscribe();
      unwatch();
    };
  }, [gameId, initial, socket]);

  const send = (message: ClientMessage) => {
    setNotice(null);
    socket.send(message);
  };
  return { state, notice, send, latencyMs: socket.latencyMs };
}

function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function GameControls({
  game,
  myColor,
  receivedAt,
  send,
}: {
  game: GameView;
  myColor: Color;
  receivedAt: number;
  send: (message: ClientMessage) => void;
}) {
  const gameId = game.id;
  const [confirmResign, setConfirmResign] = useState(false);
  const now = useTicker(game.disconnected !== null || game.firstMoveDeadlineMs !== null);
  const elapsed = now - receivedAt;
  const opponentOffline = game.disconnected?.color === oppositeColor(myColor);
  const claimIn = game.disconnected ? Math.max(0, game.disconnected.claimableInMs - elapsed) : null;

  if (game.status !== 'ongoing') {
    if (game.rematchGameId) {
      return (
        <Link className="button primary" to={`/game/${game.rematchGameId}`}>
          Go to rematch
        </Link>
      );
    }
    const opponentOffered = game.rematchOfferBy === oppositeColor(myColor);
    return (
      <div className="controls">
        {game.rematchOfferBy === myColor ? (
          <span className="muted">Rematch offered…</span>
        ) : (
          <button
            type="button"
            className="button primary"
            onClick={() => send({ t: 'game.rematch.offer', gameId })}
          >
            {opponentOffered ? 'Accept rematch' : 'Offer rematch'}
          </button>
        )}
        {opponentOffered && (
          <button
            type="button"
            className="button ghost"
            onClick={() => send({ t: 'game.rematch.decline', gameId })}
          >
            Decline
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="controls">
      {game.firstMoveDeadlineMs !== null && game.turn === myColor && (
        <p className="notice">
          Make your first move within{' '}
          {Math.ceil(Math.max(0, game.firstMoveDeadlineMs - elapsed) / 1000)}s or the game is
          aborted.
        </p>
      )}
      {game.drawOfferBy === oppositeColor(myColor) && (
        <div className="offer">
          <span>Your opponent offers a draw.</span>
          <button
            type="button"
            className="button primary"
            onClick={() => send({ t: 'game.draw.accept', gameId })}
          >
            Accept
          </button>
          <button
            type="button"
            className="button ghost"
            onClick={() => send({ t: 'game.draw.decline', gameId })}
          >
            Decline
          </button>
        </div>
      )}
      {opponentOffline && claimIn !== null && (
        <div className="offer">
          <span>
            Your opponent left the game.
            {claimIn > 0 ? ` You can claim the win in ${Math.ceil(claimIn / 1000)}s.` : ''}
          </span>
          <button
            type="button"
            className="button primary"
            disabled={claimIn > 0}
            onClick={() => send({ t: 'game.claimVictory', gameId })}
          >
            {game.abortable ? 'Abort game' : 'Claim victory'}
          </button>
        </div>
      )}
      <div className="button-row">
        {game.abortable ? (
          <button
            type="button"
            className="button"
            onClick={() => send({ t: 'game.abort', gameId })}
          >
            Abort
          </button>
        ) : confirmResign ? (
          <>
            <button
              type="button"
              className="button danger"
              onClick={() => send({ t: 'game.resign', gameId })}
            >
              Confirm resign
            </button>
            <button type="button" className="button ghost" onClick={() => setConfirmResign(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmResign(true)}>
            Resign
          </button>
        )}
        {!game.abortable && (
          <button
            type="button"
            className="button"
            disabled={game.drawOfferBy === myColor}
            onClick={() => send({ t: 'game.draw.offer', gameId })}
          >
            {game.drawOfferBy === myColor ? 'Draw offered' : 'Offer draw'}
          </button>
        )}
      </div>
    </div>
  );
}

function LiveGameView({ initial }: { initial: GameView }) {
  const { me } = useSession();
  const { state, notice, send, latencyMs } = useLiveGame(initial.id, initial);
  const game = state?.game ?? initial;
  const receivedAt = state?.receivedAt ?? 0;
  const myColor: Color | null =
    game.players.white.key === me?.playerKey
      ? 'white'
      : game.players.black.key === me?.playerKey
        ? 'black'
        : null;
  const [flipped, setFlipped] = useState(false);
  const bottomColor = flipped ? oppositeColor(myColor ?? 'white') : (myColor ?? 'white');
  const topColor = oppositeColor(bottomColor);
  const maxPly = game.movesUci.length;
  const [ply, setPly] = usePly(maxPly);
  const atLatest = ply === maxPly;
  const fen = useMemo(
    () => (atLatest ? game.fen : positionAfter(game.initialFen, game.movesUci, ply)),
    [atLatest, game.fen, game.initialFen, game.movesUci, ply],
  );
  const ongoing = game.status === 'ongoing';

  const clockFor = (color: Color) => (
    <Clock
      ms={game.clockMs[color]}
      running={game.clockRunning === color}
      receivedAt={receivedAt}
      latencyMs={game.clockRunning === color ? latencyMs : 0}
    />
  );

  const expected = myColor && game.expectedChanges ? game.expectedChanges[myColor] : null;

  return (
    <div className="game-layout">
      <div className="board-column">
        <PlayerBar
          player={game.players[topColor]}
          ratingChange={game.ratingChanges?.[topColor]}
          clock={clockFor(topColor)}
          showConnection={ongoing}
        />
        <ChessBoard
          fen={fen}
          orientation={bottomColor}
          movableColor={ongoing && atLatest && myColor ? myColor : null}
          lastMove={lastMoveSquares(game.movesUci, ply)}
          onMove={(uci) =>
            send({ t: 'game.move', gameId: game.id, uci, ply: game.movesUci.length })
          }
        />
        <PlayerBar
          player={game.players[bottomColor]}
          ratingChange={game.ratingChanges?.[bottomColor]}
          clock={clockFor(bottomColor)}
          showConnection={ongoing}
        />
      </div>
      <aside className="side-column">
        <div className="panel compact">
          <div className="game-meta">
            <strong>
              {formatTimeControl(game.timeControl)} · {game.rated ? 'Rated' : 'Casual'} {game.speed}
            </strong>
            {ongoing && game.rated && myColor && (
              <span className="muted small">Engine analysis is disabled until this game ends.</span>
            )}
          </div>
          {expected && ongoing && (
            <div className="expected">
              <span>Win</span>
              <RatingChange value={expected.win} />
              <span>Draw</span>
              <RatingChange value={expected.draw} />
              <span>Loss</span>
              <RatingChange value={expected.loss} />
            </div>
          )}
          {game.outcome && <div className="result-banner">{describeOutcome(game.outcome)}</div>}
          {game.status === 'aborted' && <div className="result-banner">Game aborted</div>}
          {myColor && game.ratingChanges && (
            <div className="result-rating">
              Your rating change: <RatingChange value={game.ratingChanges[myColor]} />
            </div>
          )}
        </div>
        <div className="panel compact">
          <MoveList sans={game.sans} currentPly={ply} onSelect={setPly} />
          <NavigationButtons
            ply={ply}
            maxPly={maxPly}
            onChange={setPly}
            onFlip={() => setFlipped((value) => !value)}
          />
        </div>
        {myColor && (
          <div className="panel compact">
            <GameControls game={game} myColor={myColor} receivedAt={receivedAt} send={send} />
            {notice && <p className="error-text">{notice}</p>}
          </div>
        )}
        {!myColor && <p className="muted small">You are watching this game.</p>}
        {!ongoing && game.status === 'finished' && (
          <div className="panel compact button-row">
            <Link className="button" to={`/review/${game.id}`}>
              Review game
            </Link>
            <a className="button ghost" href={`/api/games/${game.id}/pgn`}>
              Download PGN
            </a>
          </div>
        )}
      </aside>
    </div>
  );
}

export function GamePage() {
  const { id = '' } = useParams();
  const [lookup, setLookup] = useState<{ live: GameView | null; record: GameRecord | null } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLookup(null);
    setError(null);
    endpoints
      .game(id)
      .then((result) => {
        if (cancelled) return;
        setLookup(
          result.live ? { live: result.game, record: null } : { live: null, record: result.record },
        );
      })
      .catch((caught: unknown) => !cancelled && setError(errorText(caught)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) return <section className="panel narrow error-text">{error}</section>;
  if (!lookup) return <section className="panel narrow">Loading game…</section>;
  if (lookup.live) return <LiveGameView key={lookup.live.id} initial={lookup.live} />;
  if (lookup.record) return <FinishedGame record={lookup.record} />;
  return null;
}
