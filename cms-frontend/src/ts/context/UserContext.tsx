import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@ts/config';
import { authFetch, getToken } from '@ts/utils/auth';
import { UserContext } from './userContextValue';
import type { CurrentUser } from '@ts/types/constants';

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<CurrentUser | null>(null);

  const refreshUser = useCallback(async () => {
    if (!getToken()) return;
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
    }
  }, []);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  return <UserContext.Provider value={{ user, refreshUser }}>{children}</UserContext.Provider>;
};
