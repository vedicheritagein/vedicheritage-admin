import { useState } from 'react';
import { ApiError, signIn } from '../lib/api';

export interface LoginScreenProps {
  onSignedIn: (session: { token: string; expiresAt: string }) => void;
}

/**
 * Sign in.
 *
 * Email and password, both real fields - which also means a password manager
 * can file the entry properly, and the browser can offer it back.
 *
 * The failure message is deliberately the same whichever half was wrong: it
 * comes from the server, which does not distinguish them either. "No such user"
 * would tell whoever is guessing which address is worth attacking.
 *
 * The one case worth explaining precisely is the 404: it means the API has no
 * admin credentials configured, which is a setup step rather than a wrong
 * entry, and leaving it as "not found" would send whoever is installing this
 * hunting for a broken URL.
 */
export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !canSubmit) return;

    setSubmitting(true);
    setError(null);

    try {
      onSignedIn(await signIn(email.trim(), password));
    } catch (cause: unknown) {
      setSubmitting(false);
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not sign in. Please try again.'
      );
      // The password never survives a failed attempt: the next try should start
      // clean, and it should not sit in the DOM of an open tab. The email stays,
      // because retyping it is pure friction - it is not the secret.
      setPassword('');
    }
  };

  const fieldStyle = {
    borderColor: error ? 'var(--status-critical)' : 'var(--baseline)',
    background: '#fff'
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div
        className="w-full max-w-[380px] overflow-hidden rounded-2xl border bg-[var(--surface-1)] shadow-xl"
        style={{ borderColor: 'var(--hairline)' }}
      >
        <div className="px-6 py-5" style={{ background: 'var(--brand-maroon)' }}>
          <h1 className="m-0 text-[16px] font-bold text-[#FFD238]">
            Fundraiser Dashboard
          </h1>
          <p className="m-0 mt-0.5 text-[11.5px] text-[#FFF5ED]/75">
            Vedic Heritage Inc. · committee access only
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5">
          <label
            htmlFor="email"
            className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.07em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
            className="w-full rounded-md border px-3 py-2.5 text-[13px]"
            style={fieldStyle}
          />

          <label
            htmlFor="password"
            className="mb-1.5 mt-3.5 block text-[10.5px] font-semibold uppercase tracking-[0.07em]"
            style={{ color: 'var(--text-muted)' }}
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'sign-in-error' : undefined}
            className="w-full rounded-md border px-3 py-2.5 text-[13px]"
            style={fieldStyle}
          />

          {error && (
            <p
              id="sign-in-error"
              role="alert"
              className="mt-2.5 text-[11.5px] leading-snug"
              style={{ color: 'var(--status-critical)' }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="mt-4 w-full rounded-md py-2.5 text-[11.5px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
            style={{ background: 'var(--brand-gold)' }}
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>

          <p
            className="m-0 mt-3 text-[10.5px] leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            This dashboard shows donors&rsquo; contact details and payments.
            Repeated wrong attempts are blocked for fifteen minutes.
          </p>
        </form>
      </div>
    </div>
  );
}

export default LoginScreen;
