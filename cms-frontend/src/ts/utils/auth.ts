import { API_BASE_URL } from '@ts/config';

export const getToken = (): string | null => {
  return localStorage.getItem('idToken');
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

const redirectToLogin = () => {
  const path = window.location.pathname;
  if (path === '/login/' || path === '/signup/') return;
  localStorage.removeItem('idToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/login/';
};

export const refreshTokens = async (): Promise<boolean> => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    redirectToLogin();
    return false;
  }
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      redirectToLogin();
      return false;
    }
    const data = await res.json();
    localStorage.setItem('idToken', data.idToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch {
    redirectToLogin();
    return false;
  }
};

export const authFetch = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
  let token = getToken();

  if (token && isTokenExpired(token)) {
    const ok = await refreshTokens();
    if (!ok) throw new Error('Session expired. Please log in again.');
    token = getToken();
  }

  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    const ok = await refreshTokens();
    if (ok) {
      token = getToken();
      const retryHeaders = new Headers(init?.headers);
      if (token) retryHeaders.set('Authorization', `Bearer ${token}`);
      res = await fetch(input, { ...init, headers: retryHeaders });
      if (res.status === 401) redirectToLogin();
    }
  }

  return res;
};
