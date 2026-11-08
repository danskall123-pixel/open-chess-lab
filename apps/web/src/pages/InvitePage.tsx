import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { SeekView } from '@open-chess-lab/shared';
import { formatTimeControl } from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import { CopyButton } from '../components/CopyButton';
import { useSession } from '../state/session';

export function InvitePage() {
  const { id = '' } = useParams();
  const { me } = useSession();
  const navigate = useNavigate();
  const [seek, setSeek] = useState<SeekView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const playerKey = me?.playerKey;

  useEffect(() => {
    if (!playerKey) return;
    let cancelled = false;
    endpoints
      .seek(id)
      .then((result) => !cancelled && setSeek(result.seek))
      .catch((caught: unknown) => !cancelled && setError(errorText(caught)));
    return () => {
      cancelled = true;
    };
  }, [id, playerKey]);

  const act = async (action: () => Promise<unknown>) => {
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

  if (error && !seek) {
    return (
      <section className="panel narrow">
        <h1>Challenge unavailable</h1>
        <p className="error-text">{error}</p>
        <Link to="/">Back to the lobby</Link>
      </section>
    );
  }
  if (!seek) return <section className="panel narrow">Loading challenge…</section>;

  const link = `${window.location.origin}/invite/${seek.id}`;
  const colorText =
    seek.color === 'random' ? 'random colors' : `${seek.owner.name} plays ${seek.color}`;
  const needsAccount = seek.rated && !me?.user;

  return (
    <section className="panel narrow">
      <h1>{seek.mine ? 'Your challenge is ready' : `${seek.owner.name} challenges you`}</h1>
      <p>
        {formatTimeControl(seek.timeControl)} · {seek.rated ? 'Rated' : 'Casual'} {seek.speed} ·{' '}
        {colorText}
      </p>
      {seek.mine ? (
        <>
          <p className="muted">
            Send this link to your friend. This page switches to the game when they accept.
          </p>
          <div className="share-link">
            <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
            <CopyButton text={link} label="Copy link" />
          </div>
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await endpoints.cancelSeek(seek.id);
                void navigate('/');
              })
            }
          >
            Cancel challenge
          </button>
        </>
      ) : needsAccount ? (
        <p>
          This is a rated game. <Link to="/login">Log in</Link> or{' '}
          <Link to="/register">sign up</Link> to accept it.
        </p>
      ) : (
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => void act(() => endpoints.acceptSeek(seek.id))}
        >
          Accept challenge
        </button>
      )}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
