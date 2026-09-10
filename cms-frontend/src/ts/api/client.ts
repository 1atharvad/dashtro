import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';

// FastAPI returns either a plain string detail (e.g. duplicate name) or a list
// of pydantic validation errors (e.g. bad name format) — surface either as text,
// falling back to a generic message when the body isn't in that shape at all.
const extractErrorMessage = async (res: Response, fallback: string): Promise<string> => {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return (detail as { msg?: string }[]).map(e => e.msg).filter(Boolean).join(' ') || fallback;
    }
  } catch {
    // no JSON body, or the response has no .json() at all (e.g. a test mock)
  }
  return fallback;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Drops empty-string fields so the backend only sees intentionally-set values.
export const stripEmpty = <T extends object>(input: T): Record<string, unknown> =>
  Object.entries(input).reduce((acc: Record<string, unknown>, [key, value]) => {
    if (value !== '') acc[key] = value;
    return acc;
  }, {});

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit & { parseJson?: boolean }
): Promise<T> => {
  const { parseJson = true, ...requestInit } = init ?? {};
  const res = await authFetch(`${API_BASE_URL}${path}`, {
    ...requestInit,
    headers: { 'Content-Type': 'application/json', ...requestInit.headers },
  });
  if (!res.ok) {
    throw new ApiError(await extractErrorMessage(res, `Request failed: ${res.status} ${path}`), res.status);
  }
  if (!parseJson) return undefined as T;
  return res.json();
};
