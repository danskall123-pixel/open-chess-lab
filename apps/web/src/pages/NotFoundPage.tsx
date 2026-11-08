import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="panel narrow">
      <h1>Page not found</h1>
      <p>That square is empty.</p>
      <Link className="button primary" to="/">
        Back to the lobby
      </Link>
    </section>
  );
}
