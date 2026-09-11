import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '@ts/config';
import { authFetch, PUBLIC_PATHS } from '@ts/utils/auth';
import { UserContext } from './userContextValue';
import type { CurrentUser } from '@ts/types/constants';

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);
  // Whether the current-user check has resolved at least once (success or
  // failure) — lets ProtectedRoute tell "still checking" apart from
  // "confirmed signed out", both of which start out as user === null.
  const [checked, setChecked] = useState(false);
  // De-dupes concurrent callers (UserProvider's own mount effect,
  // ProtectedRoute, AppHeader) into a single in-flight GET /auth/ instead of
  // each firing its own request.
  const inFlight = useRef<Promise<void> | null>(null);

  const refreshUser = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    const promise = (async () => {
      try {
        const r = await authFetch(`${API_BASE_URL}/auth/`);
        const data = r.ok ? await r.json() : null;
        if (!data) return;
        const firstName = data.first_name || '';
        const lastName = data.last_name || '';
        const displayName = [firstName, lastName].filter(Boolean).join(' ') || data.email.split('@')[0];
        const initials = firstName && lastName
          ? `${firstName[0]}${lastName[0]}`.toUpperCase()
          : displayName.slice(0, 2).toUpperCase();
        setUser({ uid: data.uid, email: data.email, firstName, lastName, displayName, initials, role: data.role ?? 'Member', avatarUrl: data.avatar_url });
      } catch {
        // Ignore — the user stays unauthenticated and ProtectedRoute handles the redirect.
      } finally {
        setChecked(true);
        inFlight.current = null;
      }
    })();

    inFlight.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    // No session to check yet on a signed-out-only page (login, signup,
    // forgot/reset password) — skip the doomed-to-401 request entirely.
    if (PUBLIC_PATHS.includes(window.location.pathname)) return;
    refreshUser();
  }, [refreshUser]);

  return <UserContext.Provider value={{ user, refreshUser, checked }}>{children}</UserContext.Provider>;
};
