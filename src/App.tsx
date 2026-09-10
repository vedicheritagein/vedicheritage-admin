import { useCallback, useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { LoginScreen } from './components/LoginScreen';
import { clearSession, loadSession, saveSession } from './lib/session';

/**
 * Signed in, or not.
 *
 * The whole app is this one decision. There is no router: the dashboard is a
 * single page, and adding routes would mean a URL that looks shareable when it
 * is not - every view here needs the same session and shows the same data.
 *
 * The session is read once at startup, so a refresh mid-event does not mean
 * typing the passphrase again, and an expired token is dropped before it can
 * make a request that would only bounce back.
 */
export function App() {
  const [session, setSession] = useState(loadSession);
  // Distinguishes "you signed out" from "your session ran out", so the second
  // case can say so rather than looking like a random logout.
  const [expiredNotice, setExpiredNotice] = useState(false);

  const signIn = useCallback((next: { token: string; expiresAt: string }) => {
    saveSession(next);
    setExpiredNotice(false);
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const sessionExpired = useCallback(() => {
    clearSession();
    setSession(null);
    setExpiredNotice(true);
  }, []);

  if (!session) {
    return (
      <>
        {expiredNotice && (
          <p
            role="status"
            className="m-0 px-4 py-2 text-center text-[12px]"
            style={{
              background: 'rgba(250, 178, 25, 0.16)',
              color: '#8a6100'
            }}
          >
            Your session has ended. Please sign in again.
          </p>
        )}
        <LoginScreen onSignedIn={signIn} />
      </>
    );
  }

  return (
    <Dashboard
      token={session.token}
      onSignOut={signOut}
      onSessionExpired={sessionExpired}
    />
  );
}

export default App;
