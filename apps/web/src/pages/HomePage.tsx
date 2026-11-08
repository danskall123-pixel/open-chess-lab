import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { CreateSeekRequest, SeekView, TimeControl } from '@open-chess-lab/shared';
import {
  TIME_CONTROL_PRESETS,
  formatTimeControl,
  speedOf,
  timeControlKey,
} from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import { SeekForm } from '../components/SeekForm';
import { useSession } from '../state/session';

interface QueueState {
  queued: boolean;
  timeControl: TimeControl | null;
  rated: boolean;
}

function useLobby() {
  const { socket } = useSession();
  const [seeks, setSeeks] = useState<SeekView[]>([]);
  const [queue, setQueue] = useState<QueueState>({
    queued: false,
    timeControl: null,
    rated: false,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const leaveLobby = socket.joinLobby();
    const unsubscribe = socket.subscribe((message) => {
      if (message.t === 'lobby.seeks') setSeeks(message.seeks);
      if (message.t === 'queue.status') setQueue(message);
      if (message.t === 'error') setError(message.message);
    });
    return () => {
      unsubscribe();
      leaveLobby();
    };
  }, [socket]);

  return { seeks, queue, error, setError };
}

function seekColorLabel(seek: SeekView): string {
  if (seek.color === 'random') return 'Random';
  return seek.color === 'white' ? 'Plays white' : 'Plays black';
}

function ratingRangeLabel(seek: SeekView): string {
  const { min, max } = seek.ratingRange;
  if (min === null && max === null) return 'Any rating';
  return `${min ?? '…'}–${max ?? '…'}`;
}

export function HomePage() {
  const { me, socket } = useSession();
  const { seeks, queue, error, setError } = useLobby();
  const [ratedPairing, setRatedPairing] = useState(false);
  const [busy, setBusy] = useState(false);
  const canPlayRated = Boolean(me?.user && !me.user.marked);
  const rated = ratedPairing && canPlayRated;

  const joinQueue = (timeControl: TimeControl) => {
    setError(null);
    socket.send({ t: 'queue.join', timeControl, rated });
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const createSeek = (request: CreateSeekRequest) => void run(() => endpoints.createSeek(request));
  const acceptSeek = (id: string) => void run(() => endpoints.acceptSeek(id));
  const cancelSeek = (id: string) => void run(() => endpoints.cancelSeek(id));

  return (
    <div className="home">
      <section className="panel">
        <div className="panel-header">
          <h2>Quick pairing</h2>
          <fieldset className="segmented small" aria-label="Rated or casual pairing">
            <button
              type="button"
              className={!rated ? 'selected' : ''}
              onClick={() => setRatedPairing(false)}
            >
              Casual
            </button>
            <button
              type="button"
              className={rated ? 'selected' : ''}
              disabled={!canPlayRated}
              onClick={() => setRatedPairing(true)}
              title={canPlayRated ? undefined : 'Create an account to play rated games'}
            >
              Rated
            </button>
          </fieldset>
        </div>
        <div className="pairing-grid">
          {TIME_CONTROL_PRESETS.map((preset) => {
            const active =
              queue.queued &&
              queue.timeControl &&
              timeControlKey(queue.timeControl) === timeControlKey(preset) &&
              queue.rated === rated;
            return (
              <button
                key={timeControlKey(preset)}
                type="button"
                className={`pairing-tile ${active ? 'active' : ''}`}
                onClick={() => (active ? socket.send({ t: 'queue.leave' }) : joinQueue(preset))}
              >
                <span className="pairing-time">{formatTimeControl(preset)}</span>
                <span className="pairing-speed">
                  {active ? 'Searching… click to cancel' : speedOf(preset)}
                </span>
              </button>
            );
          })}
        </div>
        {queue.queued && queue.timeControl && (
          <p className="muted">
            Looking for an opponent at {formatTimeControl(queue.timeControl)} (
            {queue.rated ? 'rated' : 'casual'}). The allowed rating range widens the longer you
            wait.
          </p>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="panel">
        <h2>Open seeks</h2>
        {seeks.length === 0 ? (
          <p className="empty-state">
            No open seeks right now. Create one below or use quick pairing.
          </p>
        ) : (
          <table className="table seeks">
            <thead>
              <tr>
                <th>Player</th>
                <th>Rating</th>
                <th>Time</th>
                <th>Mode</th>
                <th>Color</th>
                <th>Range</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {seeks.map((seek) => (
                <tr key={seek.id} className={seek.mine ? 'mine' : ''}>
                  <td>{seek.owner.name}</td>
                  <td>
                    {seek.owner.rating === null
                      ? '–'
                      : `${seek.owner.rating}${seek.owner.provisional ? '?' : ''}`}
                  </td>
                  <td>{formatTimeControl(seek.timeControl)}</td>
                  <td>{seek.rated ? 'Rated' : 'Casual'}</td>
                  <td>{seekColorLabel(seek)}</td>
                  <td>{ratingRangeLabel(seek)}</td>
                  <td>
                    {seek.mine ? (
                      <button
                        type="button"
                        className="button ghost"
                        disabled={busy}
                        onClick={() => cancelSeek(seek.id)}
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="button primary"
                        disabled={busy}
                        onClick={() => acceptSeek(seek.id)}
                      >
                        Accept
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Create a seek</h2>
        {!canPlayRated && (
          <p className="muted">
            Guests can play casual games. <Link to="/register">Create an account</Link> to play
            rated.
          </p>
        )}
        <SeekForm
          isInvite={false}
          canPlayRated={canPlayRated}
          submitLabel="Create seek"
          busy={busy}
          onSubmit={createSeek}
        />
      </section>

      <section className="panel shortcuts">
        <Link className="shortcut" to="/play/computer">
          <strong>Play the computer</strong>
          <span>Eight levels of Stockfish, always unrated.</span>
        </Link>
        <Link className="shortcut" to="/play/friend">
          <strong>Play a friend</strong>
          <span>Share an invite link or play on one device.</span>
        </Link>
        <Link className="shortcut" to="/analysis">
          <strong>Analysis board</strong>
          <span>Explore positions with multi-line Stockfish.</span>
        </Link>
        <Link className="shortcut" to="/import">
          <strong>Import PGN or FEN</strong>
          <span>Review your games move by move.</span>
        </Link>
      </section>
    </div>
  );
}
