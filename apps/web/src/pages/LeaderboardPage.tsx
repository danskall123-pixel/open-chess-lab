import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { LeaderboardEntry, Speed } from '@open-chess-lab/shared';
import { SPEEDS } from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';

export function LeaderboardPage() {
  const [speed, setSpeed] = useState<Speed>('blitz');
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    endpoints
      .leaderboard(speed)
      .then((result) => !cancelled && setEntries(result.entries))
      .catch((caught: unknown) => !cancelled && setError(errorText(caught)));
    return () => {
      cancelled = true;
    };
  }, [speed]);

  return (
    <section className="panel">
      <div className="panel-header">
        <h1>Leaderboard</h1>
        <div className="segmented" role="tablist">
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={option === speed}
              className={option === speed ? 'selected' : ''}
              onClick={() => setSpeed(option)}
            >
              {option[0]?.toUpperCase()}
              {option.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">
        Only established ratings appear here; provisional players are hidden until their rating
        settles.
      </p>
      {error && <p className="error-text">{error}</p>}
      {!entries ? (
        <p>Loading…</p>
      ) : entries.length === 0 ? (
        <p className="empty-state">Nobody has an established {speed} rating yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Rating</th>
              <th>Games</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.username}>
                <td>{entry.rank}</td>
                <td>
                  <Link to={`/@/${entry.username}`}>{entry.username}</Link>
                </td>
                <td>{entry.rating}</td>
                <td>{entry.games}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
