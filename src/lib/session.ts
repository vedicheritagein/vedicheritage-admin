/**
 * Where the session token lives while the dashboard is open.
 *
 * `sessionStorage`, not `localStorage`, and the difference is the point: it is
 * scoped to the one tab and is gone when that tab closes. A token to the whole
 * donor list should not outlive the browsing session on a shared committee
 * laptop, and it must not be readable by another tab on the same machine.
 *
 * It survives a page refresh, which is the one convenience worth having - a
 * refresh mid-event should not mean typing the passphrase again.
 *
 * Storage access can throw outright (private windows, browsers set to block
 * site data), so every call is guarded and the dashboard simply behaves as if
 * signed out rather than breaking.
 */

const TOKEN_KEY = 'vh-admin-token';
const EXPIRY_KEY = 'vh-admin-expires';

export interface StoredSession {
  token: string;
  expiresAt: string;
}

export function loadSession(): StoredSession | null {
  try {
    const token = window.sessionStorage.getItem(TOKEN_KEY);
    const expiresAt = window.sessionStorage.getItem(EXPIRY_KEY);
    if (!token || !expiresAt) return null;

    // An elapsed token is worthless: drop it rather than letting the dashboard
    // start up, fire a request and bounce straight back to the sign-in screen.
    if (Date.parse(expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }

    return { token, expiresAt };
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    window.sessionStorage.setItem(TOKEN_KEY, session.token);
    window.sessionStorage.setItem(EXPIRY_KEY, session.expiresAt);
  } catch {
    // Storage unavailable. The session still works for this page load; it just
    // will not survive a refresh.
  }
}

export function clearSession(): void {
  try {
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(EXPIRY_KEY);
  } catch {
    // Nothing to do: if it cannot be read it cannot be used either.
  }
}
