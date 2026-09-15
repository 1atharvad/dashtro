import type { RtdbUpdate } from './types';

/** Live Realtime Database client — read/write JSON at any path, plus a
 *  websocket subscription for push updates. Project-scoped (no workspace),
 *  API-key authed via the same /api/sdk surface as documents. */
export class DashtroRtdbClient {
  private base: string;
  private wsBase: string;
  private apiKey: string;

  constructor(baseUrl: string, projectId: string, apiKey: string) {
    const httpBase = baseUrl.replace(/\/$/, '');
    this.base = `${httpBase}/api/sdk/projects/${projectId}/rtdb`;
    this.wsBase = `${this.base.replace(/^http/, 'ws')}`;
    this.apiKey = apiKey;
  }

  private url(path = '') {
    return path ? `${this.base}/${path.replace(/^\//, '')}` : `${this.base}/`;
  }

  async get<T = unknown>(path = ''): Promise<T> {
    const res = await fetch(this.url(path), { headers: { 'X-API-Key': this.apiKey } });
    if (!res.ok) throw new Error(`Dashtro RTDB: ${res.status} GET ${path}`);
    return res.json();
  }

  async set(path: string, value: unknown): Promise<void> {
    const res = await fetch(this.url(path), {
      method: 'PUT',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`Dashtro RTDB: ${res.status} PUT ${path}`);
  }

  /** Appends `value` as a new child under a generated key, rather than an
   *  explicit path — the recommended way to add an item to an ordered
   *  collection: deleting a push-keyed child never shifts a sibling's
   *  address, unlike deleting a numeric list index would. Returns the
   *  generated key. */
  async push(path: string, value: unknown): Promise<string> {
    const res = await fetch(this.url(path), {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`Dashtro RTDB: ${res.status} POST ${path}`);
    return (await res.json()).key;
  }

  /** Shallow-merges `value` (must be an object) into the existing node. */
  async update(path: string, value: Record<string, unknown>): Promise<void> {
    const res = await fetch(this.url(path), {
      method: 'PATCH',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`Dashtro RTDB: ${res.status} PATCH ${path}`);
  }

  async remove(path = ''): Promise<void> {
    const res = await fetch(this.url(path), {
      method: 'DELETE',
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!res.ok) throw new Error(`Dashtro RTDB: ${res.status} DELETE ${path}`);
  }

  /** Opens a websocket and calls `onUpdate` for every push message whose path
   *  is at or below `path` (default: the whole tree). Reconnects automatically
   *  on an unexpected drop (with backoff), so a network blip doesn't silently
   *  end live updates until the caller notices. Returns an unsubscribe
   *  function that stops reconnecting and closes the socket. */
  subscribe(onUpdate: (update: RtdbUpdate) => void, path = ''): () => void {
    let closedByCaller = false;
    let ws: WebSocket | null = null;
    let retryDelay = 1000;
    const maxRetryDelay = 30000;

    const connect = () => {
      ws = new WebSocket(`${this.wsBase}/ws`);
      ws.onopen = () => {
        retryDelay = 1000;
        ws?.send(JSON.stringify({ api_key: this.apiKey }));
      };
      ws.onmessage = (event) => {
        const update: RtdbUpdate = JSON.parse(event.data);
        if (!path || update.path === path || update.path.startsWith(`${path}/`)) {
          onUpdate(update);
        }
      };
      ws.onclose = () => {
        if (closedByCaller) return;
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, maxRetryDelay);
      };
    };
    connect();

    return () => {
      closedByCaller = true;
      ws?.close();
    };
  }
}
