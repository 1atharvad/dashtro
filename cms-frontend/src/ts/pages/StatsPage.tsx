import { useEffect, useState } from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { fetchStats, type ServerStats } from '@ts/api/stats';
import dashtroLogo from '@/assets/images/favicon-96x96.png';
import '@/scss/Login.scss';
import '@/scss/Stats.scss';

/** Matches the backend's snapshot cache window, so polling faster would only re-read the same data. */
const REFRESH_MS = 10_000;

/** Format a duration in seconds as e.g. "2d 3h 14m". */
const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
};

/** Format a byte count in MB, or "n/a" when the server can't report it. */
const formatMemory = (bytes: number | null): string =>
  bytes === null ? 'n/a' : `${(bytes / 1024 / 1024).toFixed(0)} MB`;

type Health = 'ok' | 'degraded' | 'down';

const HEALTH_LABEL: Record<Health, string> = {
  ok: 'Operational',
  degraded: 'Degraded',
  down: 'Unreachable',
};

/** Pick the status icon so state is never conveyed by color alone. */
const HealthIcon = ({ health }: { health: Health }) => {
  if (health === 'ok') return <CheckCircle2 className="h-5 w-5" aria-hidden="true" />;
  if (health === 'degraded') return <AlertTriangle className="h-5 w-5" aria-hidden="true" />;
  return <XCircle className="h-5 w-5" aria-hidden="true" />;
};

/** A labelled value row inside a stats card. */
const StatRow = ({ label, value }: { label: string; value: string }) => (
  <Box className="stats-row">
    <span className="stats-label">{label}</span>
    <span className="stats-value">{value}</span>
  </Box>
);

/** Public server status page: version, uptime, database health and process resources. */
export const StatsPage = () => {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    /** Load the latest snapshot, flagging the server unreachable if the request fails. */
    const load = async () => {
      try {
        const next = await fetchStats();
        if (cancelled) return;
        setStats(next);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const health: Health = failed ? 'down' : stats?.status ?? 'degraded';
  const connections = stats?.database.connections ?? null;
  const connectionPercent = connections ? Math.round((connections.used / connections.max) * 100) : 0;

  return (
    <Box className="login-page stats-page">
      <Box className="stats-container">
        <Box className="login-brand">
          <img src={dashtroLogo} alt="DashTro" className="login-logo" />
          <Typography className="login-brand-name">DashTro</Typography>
        </Box>

        <Box className="stats-header">
          <Typography variant="h6" fontWeight={700} component="h1">Server status</Typography>
          {(stats || failed) && (
            <Box className={`stats-status stats-status-${health}`} role="status">
              <HealthIcon health={health} />
              <span>{HEALTH_LABEL[health]}</span>
            </Box>
          )}
        </Box>

        {!stats && !failed && (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        )}

        {failed && !stats && (
          <Typography variant="body2" color="text.secondary">
            The server did not respond to the status request.
          </Typography>
        )}

        {stats && (
          <Box className="stats-grid">
            <Box className="stats-card">
              <h2 className="stats-card-title">Release</h2>
              <StatRow label="Version" value={stats.version} />
              <StatRow label="Uptime" value={formatUptime(stats.uptime_seconds)} />
            </Box>

            <Box className="stats-card">
              <h2 className="stats-card-title">Database</h2>
              <StatRow label="Type" value={stats.database.type} />
              <StatRow label="Connection" value={stats.database.ok ? 'Reachable' : 'Unreachable'} />
              <StatRow
                label="Latency"
                value={stats.database.latency_ms === null ? 'n/a' : `${stats.database.latency_ms} ms`}
              />
              {connections && (
                <Box className="stats-connections">
                  <StatRow
                    label="Connections"
                    value={`${connections.used} / ${connections.max} (${connectionPercent}%)`}
                  />
                  <LinearProgress
                    variant="determinate"
                    value={connectionPercent}
                    color={connectionPercent >= 90 ? 'error' : connectionPercent >= 70 ? 'warning' : 'primary'}
                    aria-label="Database connections in use"
                  />
                </Box>
              )}
            </Box>

            <Box className="stats-card">
              <h2 className="stats-card-title">Process</h2>
              <StatRow label="Memory" value={formatMemory(stats.process.memory_bytes)} />
              <StatRow label="Threads" value={String(stats.process.threads)} />
            </Box>
          </Box>
        )}

        {stats && (
          <Typography variant="caption" color="text.secondary" className="stats-footer">
            Updated {new Date(stats.generated_at * 1000).toLocaleTimeString()} · refreshes every 10s
          </Typography>
        )}
      </Box>
    </Box>
  );
};
