import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import type { GameSummary, ProfileResponse, Speed } from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import { GameTable } from '../components/GameTable';
import { LineChart } from '../components/LineChart';

const SPEED_LABELS: Record<Speed, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
};

function percentage(part: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((part / total) * 100)}%`;
}

export function ProfilePage() {
  const { username = '' } = useParams();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState<Speed>('blitz');
  const [games, setGames] = useState<GameSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
    endpoints
      .profile(username)
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        setGames(result.games);
        setPage(1);
        setHasMore(result.games.length >= 20);
        const mostPlayed = [...result.ratings].sort((a, b) => b.games - a.games)[0];
        if (mostPlayed && mostPlayed.games > 0) setSpeed(mostPlayed.speed);
      })
      .catch((caught: unknown) => !cancelled && setError(errorText(caught)));
    return () => {
      cancelled = true;
    };
  }, [username]);

  const points = useMemo(
    () =>
      (profile?.history ?? [])
        .filter((point) => point.speed === speed)
        .map((point) => ({
          label: new Date(point.at).toLocaleDateString(),
          value: point.rating,
          valueLabel: `${point.rating}`,
        })),
    [profile, speed],
  );

  const loadMore = async () => {
    const next = await endpoints.userGames(username, page + 1);
    setGames((current) => [...current, ...next.games]);
    setPage(next.page);
    setHasMore(next.hasMore);
  };

  if (error) return <section className="panel narrow error-text">{error}</section>;
  if (!profile) return <section className="panel narrow">Loading profile…</section>;
  const { stats } = profile;

  return (
    <div className="profile">
      <section className="panel">
        <div className="panel-header">
          <h1>{profile.username}</h1>
          <span className="muted">
            Member since {new Date(profile.createdAt).toLocaleDateString()}
          </span>
        </div>
        {profile.marked && (
          <p className="banner error">This account was closed for violating the fair play rules.</p>
        )}
        <div className="rating-cards">
          {profile.ratings.map((rating) => (
            <button
              key={rating.speed}
              type="button"
              className={`rating-card ${rating.speed === speed ? 'selected' : ''}`}
              onClick={() => setSpeed(rating.speed)}
            >
              <span className="rating-speed">{SPEED_LABELS[rating.speed]}</span>
              <span className="rating-value">
                {rating.rating}
                {rating.provisional ? '?' : ''}
              </span>
              <span className="muted small">{rating.games} games</span>
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>{SPEED_LABELS[speed]} rating history</h2>
        {points.length < 2 ? (
          <p className="empty-state">
            Play a few rated {SPEED_LABELS[speed].toLowerCase()} games to see a graph.
          </p>
        ) : (
          <LineChart
            points={points}
            ariaLabel={`${SPEED_LABELS[speed]} rating over time`}
            height={200}
          />
        )}
      </section>
      <section className="panel">
        <h2>Results</h2>
        <div className="stats">
          <div className="stat">
            <span className="stat-value">{stats.total}</span>
            <span className="muted">games</span>
          </div>
          <div className="stat win">
            <span className="stat-value">{stats.wins}</span>
            <span className="muted">wins · {percentage(stats.wins, stats.total)}</span>
          </div>
          <div className="stat draw">
            <span className="stat-value">{stats.draws}</span>
            <span className="muted">draws · {percentage(stats.draws, stats.total)}</span>
          </div>
          <div className="stat loss">
            <span className="stat-value">{stats.losses}</span>
            <span className="muted">losses · {percentage(stats.losses, stats.total)}</span>
          </div>
        </div>
      </section>
      <section className="panel">
        <h2>Games</h2>
        <GameTable games={games} username={profile.username} />
        {hasMore && (
          <button type="button" className="button ghost" onClick={() => void loadMore()}>
            Load more
          </button>
        )}
      </section>
    </div>
  );
}
