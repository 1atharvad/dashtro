import { STATS_URL } from '@ts/config';

export interface ServerStats {
  status: 'ok' | 'degraded';
  version: string;
  started_at: number;
  uptime_seconds: number;
  generated_at: number;
  database: {
    ok: boolean;
    type: 'postgres' | 'sqlite';
    latency_ms: number | null;
    connections: { used: number; max: number } | null;
  };
  process: { memory_bytes: number | null; threads: number };
}

/** Fetch the public server status snapshot; deliberately skips auth so it works logged out. */
export const fetchStats = async (): Promise<ServerStats> => {
  const res = await fetch(STATS_URL);
  if (!res.ok) throw new Error(`Stats request failed: ${res.status}`);
  return res.json();
};
