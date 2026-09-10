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
    // The notice goes to the sign-in screen rather than being stacked above
    // it: that screen is a full-height split, and a banner on top of it would
    // push the fold down for a sentence that belongs beside the fields anyway.
    return <LoginScreen onSignedIn={signIn} expiredNotice={expiredNotice} />;
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
