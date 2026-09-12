import { useState } from 'react';
import { ApiError, signIn } from '../lib/api';
import logoImg from '../assets/logo.webp';

export interface LoginScreenProps {
  onSignedIn: (session: { token: string; expiresAt: string }) => void;
  /**
   * Set when the last session ran out rather than being signed out. Rendered
   * inside the form column instead of above the page, so the split layout is
   * not pushed off-screen by a banner.
   */
  expiredNotice?: boolean;
}

/**
 * The lattice behind the brand panel.
 *
 * An inline data URI rather than a file: it is a dozen bytes of geometry, and
 * the sign-in page should not wait on a second request to finish looking like
 * itself. Gold at 7% - a texture you notice only if you look for it, which
 * keeps every bit of contrast for the wordmark sitting on top of it.
 */
const LATTICE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Cg fill='none' stroke='%23FFD238' stroke-opacity='0.07'%3E%3Cpath d='M32 1 L63 32 L32 63 L1 32 Z'/%3E%3Ccircle cx='32' cy='32' r='9.5'/%3E%3C/g%3E%3C/svg%3E\")";

/**
 * The organisation lockup: seal, name, temple.
 *
 * Same hierarchy and wording as the public site's navbar - name over temple,
 * both letterspaced - so the two properties read as one organisation. The seal
 * keeps the white plate and navy ring it has on the site's hero, because the
 * artwork is navy line-work on white and would disappear if dropped straight
 * onto the maroon.
 */
function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'flex items-center gap-3.5' : 'flex flex-col gap-5'}>
      <div
        className="shrink-0 overflow-hidden rounded-full bg-white"
        style={{
          width: compact ? 52 : 104,
          height: compact ? 52 : 104,
          border: `${compact ? 3 : 5}px solid #2b1a6d`,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)'
        }}
      >
        <img
          src={logoImg}
          alt="Vedic Heritage Inc."
          width={155}
          height={156}
          className="h-full w-full object-contain"
        />
      </div>

      <div className="leading-[1.2]">
        <div
          className={`font-black text-[#FFD238] ${
            compact
              ? 'text-[15px] tracking-[0.11em]'
              : 'text-[26px] tracking-[0.09em]'
          }`}
        >
          VEDIC HERITAGE
        </div>
        <div
          className={`mt-0.5 font-bold uppercase text-[#FFF5ED]/60 ${
            compact
              ? 'text-[8.5px] tracking-[0.26em]'
              : 'text-[10px] tracking-[0.34em]'
          }`}
        >
          Sri Hanuman Mandir
        </div>
      </div>
    </div>
  );
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
 *
 * The layout is a split: the organisation on the left, the form on the right.
 * The brand half is decoration and collapses to a header strip under `lg`,
 * where the form is the only thing worth the width - a committee member
 * signing in from a phone in the hall gets the fields, not the artwork.
 */
export function LoginScreen({ onSignedIn, expiredNotice }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
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
      // Re-mask too. Whoever retypes should not have the second attempt sitting
      // in clear text because they revealed the first one.
      setRevealed(false);
    }
  };

  const fieldClass =
    'w-full rounded-lg border bg-white px-3.5 py-3 text-[13.5px] text-(--text-primary) transition-colors duration-150 placeholder:text-(--text-muted)';

  const fieldStyle = {
    borderColor: error ? 'var(--status-critical)' : 'var(--baseline)'
  };

  // Rows are pinned `auto` then `1fr` rather than left to stretch: stacked on
  // a phone, two auto rows split the screen between them and the brand strip
  // took a third of it to hold a 52px seal. The strip gets its content height,
  // the form gets the rest. From `lg` it is one full-height row of two columns
  // and the rows do not apply.
  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] lg:grid-cols-[1.05fr_1fr] lg:grid-rows-1">
      {/* ── Brand half ── */}
      <section
        className="relative flex flex-col justify-between overflow-hidden px-8 py-7 lg:px-14 lg:py-12"
        style={{
          background:
            'linear-gradient(157deg, #61121a 0%, #4a0d12 46%, #2b0709 100%)'
        }}
      >
        {/* Lattice, then a gold bloom over it: the panel should look lit from
            the top-left rather than flat, without a photograph to load. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: LATTICE, backgroundSize: '64px 64px' }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at 12% 8%, rgba(233, 131, 20, 0.28), transparent 58%)'
          }}
        />

        {/* Under lg the panel is a header strip, so the lockup goes compact and
            the supporting copy drops away entirely. */}
        <div className="relative lg:hidden">
          <BrandLockup compact />
        </div>

        <div className="relative hidden lg:block">
          <BrandLockup />
        </div>

        <div className="relative hidden lg:block">
          <div
            className="mb-6 h-px w-14"
            style={{ background: 'rgba(255, 210, 56, 0.45)' }}
          />
          <h1 className="m-0 text-[34px] font-extrabold leading-[1.12] tracking-[-0.015em] text-[#FFF5ED]">
            Fundraiser
            <br />
            Dashboard
          </h1>
          <p className="m-0 mt-4 max-w-[38ch] text-[14px] leading-relaxed text-[#FFF5ED]/65">
            Ticket sales, donations and discount codes for the Annual Dipawali
            Fundraising Program - in one place, updated as they come in.
          </p>
        </div>

        <p className="relative m-0 hidden text-[10.5px] uppercase tracking-[0.22em] text-[#FFF5ED]/40 lg:block">
          Committee access only
        </p>
      </section>

      {/* ── Form half ── */}
      <section className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="w-full max-w-[384px]">
          {expiredNotice && (
            <p
              role="status"
              className="m-0 mb-6 rounded-lg px-3.5 py-2.5 text-[12px] leading-snug"
              style={{
                background: 'rgba(250, 178, 25, 0.14)',
                border: '1px solid rgba(250, 178, 25, 0.4)',
                color: '#8a6100'
              }}
            >
              Your session has ended. Please sign in again.
            </p>
          )}

          <h2 className="m-0 text-[21px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">
            Welcome back
          </h2>
          <p
            className="m-0 mt-1.5 text-[13px]"
            style={{ color: 'var(--text-secondary)' }}
          >
            Sign in to your Vedic Heritage committee account.
          </p>

          <form onSubmit={handleSubmit} className="mt-7">
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
              placeholder="you@vedicheritage.org"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error)}
              className={fieldClass}
              style={fieldStyle}
            />

            <label
              htmlFor="password"
              className="mb-1.5 mt-4 block text-[10.5px] font-semibold uppercase tracking-[0.07em]"
              style={{ color: 'var(--text-muted)' }}
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                placeholder="Enter your password"
                type={revealed ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'sign-in-error' : undefined}
                className={`${fieldClass} pr-11`}
                style={fieldStyle}
              />
              {/*
                Reveal, for the passphrase that was mistyped rather than
                misremembered - the usual reason a committee member is locked
                out on the night.

                `tabIndex={-1}` on purpose: tabbing password -> submit should
                stay the path to signing in, and a control that only undoes
                masking does not deserve a stop on the way. It is still a real
                button, so a pointer or a screen reader's element list reaches
                it. The name says what the next press does, and flips with the
                state, so it is never ambiguous read aloud.
              */}
              <button
                type="button"
                onClick={() => setRevealed((shown) => !shown)}
                tabIndex={-1}
                aria-controls="password"
                aria-label={revealed ? 'Hide password' : 'Show password'}
                className="absolute top-1/2 right-1 -translate-y-1/2 cursor-pointer rounded-md border-none bg-transparent px-2.5 py-2 text-(--text-muted) transition-colors duration-150 hover:text-(--text-secondary)"
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                  {revealed && <path d="m3.5 3.5 17 17" />}
                </svg>
              </button>
            </div>

            {error && (
              <p
                id="sign-in-error"
                role="alert"
                className="m-0 mt-3 flex gap-2 rounded-lg px-3 py-2.5 text-[12px] leading-snug"
                style={{
                  background: 'rgba(208, 59, 59, 0.07)',
                  border: '1px solid rgba(208, 59, 59, 0.28)',
                  color: 'var(--status-critical)'
                }}
              >
                <span aria-hidden="true" className="font-bold">
                  !
                </span>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="mt-6 w-full cursor-pointer rounded-lg border-none py-3 text-[11.5px] font-bold uppercase tracking-[0.09em] text-white shadow-sm transition-all duration-150 hover:brightness-108 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
              style={{
                background:
                  'linear-gradient(180deg, #f0902a 0%, var(--brand-gold) 100%)'
              }}
            >
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p
            className="m-0 mt-7 border-t pt-5 text-[10.5px] leading-relaxed"
            style={{
              borderColor: 'var(--gridline)',
              color: 'var(--text-muted)'
            }}
          >
            This dashboard shows donors&rsquo; contact details and payments.
            Repeated wrong attempts are blocked for fifteen minutes.
          </p>
        </div>
      </section>
    </div>
  );
}

export default LoginScreen;
