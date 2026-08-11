import { useCallback, useEffect, useState } from 'react';
import {
  Box, Chip, Table, TableBody, TableCell,
  TableHead, TableRow, Tooltip, Typography, IconButton,
} from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { Button } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { ACTION_COLORS, ACTION_LABELS, AUDIT_PAGE_SIZE } from '@ts/data/content';
import { AuditHeatmap } from './AuditHeatmap';

type AuditLog = {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  created_at: string;
};

type LogsResponse = {
  total: number;
  logs: AuditLog[];
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return iso;
  }
};

/** Audit log activity for a single project, scoped via ?project_id= on the shared audit-logs endpoint. */
export const ProjectAuditLog = ({ projectId }: { projectId: string }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        project_id: projectId,
        limit: String(AUDIT_PAGE_SIZE),
        offset: String(pageNum * AUDIT_PAGE_SIZE),
      });
      const res = await authFetch(`${API_BASE_URL}/audit-logs/?${params}`);
      if (res.ok) {
        const data: LogsResponse = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
        setPage(pageNum);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchLogs(0); }, [fetchLogs]);

  const totalPages = Math.ceil(total / AUDIT_PAGE_SIZE);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ── Heatmap card ─────────────────────────────────────────────────── */}
      <Box className="settings-section">
        <Box className="settings-section-header">
          <Typography variant="subtitle1" fontWeight={700}>Activity Overview</Typography>
          <Typography variant="body2" color="text.secondary">Operations performed on this project over time</Typography>
        </Box>
        <Box className="settings-section-body">
          <AuditHeatmap projectId={projectId} />
        </Box>
      </Box>

      {/* ── Log table card ────────────────────────────────────────────────── */}
      <Box className="settings-section">
        <Box className="settings-section-header" sx={{ flexDirection: 'row !important', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Audit Log</Typography>
            <Typography variant="body2" color="text.secondary">
              A record of operations performed on this project
            </Typography>
          </Box>
          <Tooltip title="Refresh">
            <IconButton onClick={() => fetchLogs(page)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box className="settings-section-body" sx={{ pt: '0 !important' }}>
        <Box className="settings-table">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Resource</TableCell>
                <TableCell>Name</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      {loading ? 'Loading…' : 'No audit log entries found for this project.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {logs.map(log => (
                <TableRow key={log.id}>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" noWrap sx={{ fontSize: '0.75rem' }}>
                      {formatDate(log.created_at)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                      {log.user_email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={ACTION_LABELS[log.action] ?? log.action}
                      color={ACTION_COLORS[log.action] ?? 'default'}
                      size="small"
                      sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {log.resource_type.replace('_', ' ')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={log.resource_name || log.resource_id} placement="top">
                      <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>
                        {log.resource_name || log.resource_id || '—'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Box>

        {total > 0 && (
          <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              {total} total {total === 1 ? 'entry' : 'entries'}
              {totalPages > 1 ? ` · page ${page + 1} of ${totalPages}` : ''}
            </Typography>
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="secondary"
                  className="border-current"
                  onClick={() => fetchLogs(page - 1)}
                  disabled={page === 0 || loading}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  className="border-current"
                  onClick={() => fetchLogs(page + 1)}
                  disabled={page >= totalPages - 1 || loading}
                >
                  Next
                </Button>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
