import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { FlagView } from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import { useSession } from '../state/session';

type FlagStatus = FlagView['status'];

export function ModerationPage() {
  const { me } = useSession();
  const [status, setStatus] = useState<FlagStatus>('open');
  const [flags, setFlags] = useState<FlagView[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const isModerator = me?.user?.role === 'moderator';

  const load = useCallback(async () => {
    try {
      setFlags((await endpoints.flags(status)).flags);
    } catch (caught) {
      setMessage(errorText(caught));
    }
  }, [status]);

  useEffect(() => {
    if (isModerator) void load();
  }, [isModerator, load]);

  const act = async (action: () => Promise<string>) => {
    try {
      setMessage(await action());
      await load();
    } catch (caught) {
      setMessage(errorText(caught));
    }
  };

  if (!isModerator)
    return <section className="panel narrow">This page is only for moderators.</section>;

  return (
    <section className="panel">
      <div className="panel-header">
        <h1>Fair play review</h1>
        <div className="segmented">
          {(['open', 'confirmed', 'dismissed'] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={option === status ? 'selected' : ''}
              onClick={() => setStatus(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Flags are raised automatically after rated games when a player matches Stockfish&apos;s top
        choice unusually often with a very low average centipawn loss. Marking an account closes it
        for rated play and refunds the rating points its opponents lost.
      </p>
      {message && <p className="notice">{message}</p>}
      {flags.length === 0 ? (
        <p className="empty-state">No {status} flags.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Game</th>
              <th>Top-move match</th>
              <th>Avg. loss</th>
              <th>Moves</th>
              <th>Raised</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => (
              <tr key={flag.id}>
                <td>
                  <Link to={`/@/${flag.user.username}`}>{flag.user.username}</Link>
                  {flag.user.marked && <span className="tag">marked</span>}
                </td>
                <td>
                  <Link to={`/review/${flag.gameId}`}>{flag.gameId}</Link> ({flag.color})
                </td>
                <td>{Math.round(flag.metrics.topMoveRate * 100)}%</td>
                <td>{flag.metrics.averageCentipawnLoss.toFixed(1)} cp</td>
                <td>{flag.metrics.analyzedMoves}</td>
                <td>{new Date(flag.createdAt).toLocaleString()}</td>
                <td className="button-row">
                  {!flag.user.marked ? (
                    <button
                      type="button"
                      className="button danger"
                      onClick={() =>
                        void act(async () => {
                          const result = await endpoints.markAccount(flag.user.id);
                          return `${flag.user.username} marked. Refunded ${result.refundedPoints} points across ${result.refundedGames} games.`;
                        })
                      }
                    >
                      Mark account
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() =>
                        void act(async () => {
                          await endpoints.unmarkAccount(flag.user.id);
                          return `${flag.user.username} unmarked.`;
                        })
                      }
                    >
                      Unmark
                    </button>
                  )}
                  {flag.status === 'open' && (
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() =>
                        void act(async () => {
                          await endpoints.dismissFlag(flag.id);
                          return 'Flag dismissed.';
                        })
                      }
                    >
                      Dismiss
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
