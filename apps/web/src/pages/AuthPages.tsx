import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { endpoints } from '../api/endpoints';
import { errorText } from '../api/http';
import { useSession } from '../state/session';

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<void>) => {
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
  return { busy, error, submit };
}

function AuthCard({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="panel narrow auth-card">
      <h1>{title}</h1>
      {children}
      {footer && <div className="auth-footer">{footer}</div>}
    </section>
  );
}

export function LoginPage() {
  const { applyMe } = useSession();
  const navigate = useNavigate();
  const { busy, error, submit } = useSubmit();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(async () => {
      applyMe(await endpoints.login(login, password));
      void navigate('/');
    });
  };

  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          <Link to="/forgot-password">Forgot your password?</Link>
          <Link to="/register">Create an account</Link>
        </>
      }
    >
      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>Username or email</span>
          <input
            autoComplete="username"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button className="button primary" type="submit" disabled={busy}>
          Log in
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { applyMe } = useSession();
  const navigate = useNavigate();
  const { busy, error, submit } = useSubmit();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(async () => {
      applyMe(await endpoints.register(username, email, password));
      void navigate('/');
    });
  };

  return (
    <AuthCard
      title="Create an account"
      footer={<Link to="/login">Already have an account? Log in</Link>}
    >
      <p className="muted">
        Free forever. Your account lets you play rated games and keeps your game history.
      </p>
      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>Username</span>
          <input
            autoComplete="username"
            value={username}
            minLength={3}
            maxLength={20}
            pattern="[A-Za-z0-9][A-Za-z0-9_\-]*"
            title="Letters, digits, dashes and underscores"
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button className="button primary" type="submit" disabled={busy}>
          Sign up
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  const { busy, error, submit } = useSubmit();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(async () => {
      await endpoints.requestPasswordReset(email);
      setSent(true);
    });
  };

  return (
    <AuthCard title="Reset your password" footer={<Link to="/login">Back to log in</Link>}>
      {sent ? (
        <p>
          If an account uses that email, a reset link is on its way. The link is valid for one hour.
        </p>
      ) : (
        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button className="button primary" type="submit" disabled={busy}>
            Send reset link
          </button>
          {error && <p className="error-text">{error}</p>}
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const { applyMe } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { busy, error, submit } = useSubmit();
  const [password, setPassword] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit(async () => {
      applyMe(await endpoints.confirmPasswordReset(token, password));
      void navigate('/');
    });
  };

  if (!token) {
    return (
      <AuthCard title="Reset your password">
        <p className="error-text">This page needs the link from your reset email.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <form className="form" onSubmit={onSubmit}>
        <label className="field">
          <span>New password</span>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button className="button primary" type="submit" disabled={busy}>
          Save password
        </button>
        {error && <p className="error-text">{error}</p>}
      </form>
    </AuthCard>
  );
}
