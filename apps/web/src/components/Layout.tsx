import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { endpoints } from '../api/endpoints';
import { useSession } from '../state/session';
import { useTheme } from '../state/theme';

const NAV_ITEMS = [
  { to: '/', label: 'Play' },
  { to: '/play/computer', label: 'Computer' },
  { to: '/play/friend', label: 'Friend' },
  { to: '/analysis', label: 'Analysis' },
  { to: '/import', label: 'Import' },
  { to: '/leaderboard', label: 'Leaderboard' },
];

function UserMenu() {
  const { me, applyMe } = useSession();
  const navigate = useNavigate();
  if (!me) return null;
  if (!me.user) {
    return (
      <div className="user-menu">
        <span className="muted guest-name">{me.guestName}</span>
        <Link className="button ghost" to="/login">
          Log in
        </Link>
        <Link className="button primary" to="/register">
          Sign up
        </Link>
      </div>
    );
  }
  const logout = async () => {
    applyMe(await endpoints.logout());
    void navigate('/');
  };
  return (
    <div className="user-menu">
      {me.user.role === 'moderator' && (
        <NavLink className="nav-link" to="/mod">
          Moderation
        </NavLink>
      )}
      <Link className="nav-link strong" to={`/@/${me.user.username}`}>
        {me.user.username}
      </Link>
      <button type="button" className="button ghost" onClick={() => void logout()}>
        Log out
      </button>
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const { loadError, connected, me } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">♞</span> Open Chess Lab
        </Link>
        <button
          type="button"
          className="button ghost menu-toggle"
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>
        <nav className={`nav ${menuOpen ? 'open' : ''}`} onClick={() => setMenuOpen(false)}>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end className="nav-link">
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-actions">
          <UserMenu />
          <button
            type="button"
            className="button ghost"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? '☾' : '☀'}
          </button>
        </div>
      </header>
      {loadError && <div className="banner error">{loadError}</div>}
      {!loadError && me && !connected && (
        <div className="banner">Connecting to the live server…</div>
      )}
      <main className="content">{children}</main>
      <footer className="footer">
        Free and open source under the GPL-3.0. No ads, no tracking, no paywalls. Powered by
        Stockfish.
      </footer>
    </div>
  );
}
