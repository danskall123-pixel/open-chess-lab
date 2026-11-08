import { Link } from 'react-router';

export function EngineGateNotice({ gameId }: { gameId: string }) {
  return (
    <section className="panel narrow">
      <h1>Engine features are paused</h1>
      <p>
        You are playing a rated game right now. To keep games fair, Stockfish and the evaluation bar
        are disabled until it ends.
      </p>
      <Link className="button primary" to={`/game/${gameId}`}>
        Back to your game
      </Link>
    </section>
  );
}
