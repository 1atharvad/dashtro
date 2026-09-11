import { API_BASE_URL } from '@ts/config';

export const logout = async () => {
  try {
    await fetch(`${API_BASE_URL}/auth/logout/`, { method: 'POST', credentials: 'include' });
  } finally {
    window.location.href = '/login/';
  }
};

// Pages reachable while signed out — an expired/missing session here is
// normal, not a reason to bounce the visitor to /login/.
export const PUBLIC_PATHS = ['/login/', '/signup/', '/forgot-password/', '/reset-password/'];

const redirectToLogin = () => {
  const path = window.location.pathname;
  if (PUBLIC_PATHS.includes(path)) return;
  logout();
};

export const refreshTokens = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      redirectToLogin();
      return false;
    }
    return true;
  } catch {
    redirectToLogin();
    return false;
  }
};

export const authFetch = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
  let res = await fetch(input, { ...init, credentials: 'include' });

  if (res.status === 401) {
    const ok = await refreshTokens();
    if (ok) {
      res = await fetch(input, { ...init, credentials: 'include' });
      if (res.status === 401) redirectToLogin();
    }
  }

  return res;
};
