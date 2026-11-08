import { Link } from 'react-router';
import type { GameSummary } from '@open-chess-lab/shared';
import { formatTimeControl } from '@open-chess-lab/shared';
import { RatingChange } from './PlayerBar';

function outcomeFor(game: GameSummary, username: string): 'win' | 'loss' | 'draw' | null {
  if (game.result === '1/2-1/2') return 'draw';
  const won =
    (game.result === '1-0' && game.players.white.name === username) ||
    (game.result === '0-1' && game.players.black.name === username);
  if (game.result === null) return null;
  return won ? 'win' : 'loss';
}

export function GameTable({
  games,
  username,
}: {
  games: readonly GameSummary[];
  username: string;
}) {
  if (games.length === 0) return <p className="empty-state">No finished games yet.</p>;
  return (
    <table className="table games">
      <thead>
        <tr>
          <th>Players</th>
          <th>Result</th>
          <th>Time</th>
          <th>Moves</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        {games.map((game) => {
          const own =
            game.players.white.name === username ? game.players.white : game.players.black;
          const outcome = outcomeFor(game, username);
          return (
            <tr key={game.id}>
              <td>
                <Link to={`/game/${game.id}`}>
                  {game.players.white.name} vs {game.players.black.name}
                </Link>
              </td>
              <td>
                <span className={`outcome ${outcome ?? ''}`}>{game.result ?? '–'}</span>
                {own.ratingChange !== null && <RatingChange value={own.ratingChange} />}
              </td>
              <td>
                {formatTimeControl(game.timeControl)} {game.rated ? 'rated' : 'casual'}
              </td>
              <td>{Math.ceil(game.movesCount / 2)}</td>
              <td>{new Date(game.startedAt).toLocaleDateString()}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
