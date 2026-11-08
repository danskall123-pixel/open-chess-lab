import { Link } from 'react-router';
import type { GamePlayerView } from '@open-chess-lab/shared';

export interface PlayerBarProps {
  player: GamePlayerView;
  ratingChange?: number | null;
  clock?: React.ReactNode;
  showConnection?: boolean;
}

export function RatingChange({ value }: { value: number }) {
  const sign = value > 0 ? '+' : '';
  return (
    <span
      className={`rating-change ${value > 0 ? 'up' : value < 0 ? 'down' : ''}`}
    >{`${sign}${value}`}</span>
  );
}

export function PlayerBar({ player, ratingChange, clock, showConnection = false }: PlayerBarProps) {
  return (
    <div className="player-bar">
      <div className="player-identity">
        {showConnection && (
          <span
            className={`connection-dot ${player.connected ? 'online' : 'offline'}`}
            title={player.connected ? 'Connected' : 'Disconnected'}
          />
        )}
        {player.isGuest ? (
          <span className="player-name">{player.name}</span>
        ) : (
          <Link className="player-name" to={`/@/${player.name}`}>
            {player.name}
          </Link>
        )}
        {player.rating !== null && (
          <span className="player-rating">
            {player.rating}
            {player.provisional ? '?' : ''}
          </span>
        )}
        {ratingChange !== undefined && ratingChange !== null && (
          <RatingChange value={ratingChange} />
        )}
      </div>
      {clock}
    </div>
  );
}
