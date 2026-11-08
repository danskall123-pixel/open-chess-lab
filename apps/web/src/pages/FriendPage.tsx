import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CreateSeekRequest } from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import { SeekForm } from '../components/SeekForm';
import { useSession } from '../state/session';

export function FriendPage() {
  const { me } = useSession();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canPlayRated = Boolean(me?.user && !me.user.marked);

  const createInvite = async (request: CreateSeekRequest) => {
    setBusy(true);
    setError(null);
    try {
      const { seek } = await endpoints.createSeek(request);
      void navigate(`/invite/${seek.id}`);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="two-columns">
      <section className="panel">
        <h1>Invite a friend online</h1>
        <p className="muted">
          Create a challenge and send the link. The game starts as soon as your friend accepts.
        </p>
        <SeekForm
          isInvite
          canPlayRated={canPlayRated}
          submitLabel="Create invite link"
          busy={busy}
          onSubmit={(request) => void createInvite(request)}
        />
        {error && <p className="error-text">{error}</p>}
      </section>
      <section className="panel">
        <h1>Play on this device</h1>
        <p className="muted">Hot-seat mode: both players share one screen. Always casual.</p>
        <Link className="button primary" to="/play/local">
          Start a local game
        </Link>
      </section>
    </div>
  );
}
