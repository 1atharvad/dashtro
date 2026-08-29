import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { parseJson?: boolean }
): Promise<T> {
  const { parseJson = true, ...requestInit } = init ?? {};
  const res = await authFetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers: { 'Content-Type': 'application/json', ...requestInit.headers },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${path}`);
  if (!parseJson) return undefined as T;
  return res.json();
}
