import { useCallback, useEffect, useState } from 'react';
import {
  Box, Chip, Divider, MenuItem, Select, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Tooltip, Typography, InputLabel, FormControl,
  IconButton,
} from '@mui/material';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { AuditHeatmap } from './AuditHeatmap';
import { ACTION_COLORS, ACTION_LABELS, RESOURCE_TYPES, AUDIT_PAGE_SIZE } from '@ts/data/content';

type AuditLog = {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  project_id: string;
  workspace_name: string;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
};

type LogsResponse = {
  total: number;
  logs: AuditLog[];
};


function buildParams(
  filterAction: string,
  filterResourceType: string,
  filterFromDate: string,
  filterToDate: string,
  limit?: number,
  offset?: number,
) {
  const params = new URLSearchParams();
  if (filterAction) params.set('action', filterAction);
  if (filterResourceType) params.set('resource_type', filterResourceType);
  if (filterFromDate) params.set('from_date', new Date(filterFromDate).toISOString());
  if (filterToDate) {
    const end = new Date(filterToDate);
    end.setHours(23, 59, 59, 999);
    params.set('to_date', end.toISOString());
  }
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));
  return params;
}

export const SettingsAuditLog = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [filterAction, setFilterAction] = useState('');
  const [filterResourceType, setFilterResourceType] = useState('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');

  const fetchLogs = useCallback(async (pageNum = 0) => {
    setLoading(true);
    try {
      const params = buildParams(filterAction, filterResourceType, filterFromDate, filterToDate, AUDIT_PAGE_SIZE, pageNum * AUDIT_PAGE_SIZE);
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
  }, [filterAction, filterResourceType, filterFromDate, filterToDate]);

  useEffect(() => { fetchLogs(0); }, [fetchLogs]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const params = buildParams(filterAction, filterResourceType, filterFromDate, filterToDate);
      const res = await authFetch(`${API_BASE_URL}/audit-logs/export/?${params}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] ?? 'audit-log.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
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

  const totalPages = Math.ceil(total / AUDIT_PAGE_SIZE);
  const hasFilters = !!(filterAction || filterResourceType || filterFromDate || filterToDate);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

      {/* ── Heatmap card ─────────────────────────────────────────────────── */}
      <Box className="settings-section">
        <Box className="settings-section-header">
          <Typography variant="subtitle1" fontWeight={700}>Activity Overview</Typography>
          <Typography variant="body2" color="text.secondary">Operations performed over time</Typography>
        </Box>
        <Box className="settings-section-body">
          <AuditHeatmap />
        </Box>
      </Box>

      {/* ── Log table card ────────────────────────────────────────────────── */}
      <Box className="settings-section">
        <Box className="settings-section-header" sx={{ flexDirection: 'row !important', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Audit Log</Typography>
            <Typography variant="body2" color="text.secondary">
              A record of all operations performed in this CMS instance
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Tooltip title={`Download${hasFilters ? ' (filtered)' : ' all'} as CSV`}>
              <span>
                <IconButton onClick={handleDownload} disabled={downloading || total === 0}>
                  <Download className={`h-4 w-4 ${downloading ? 'animate-pulse' : ''}`} />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton onClick={() => fetchLogs(page)} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Filters */}
        <Box sx={{ px: 3, pb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Action</InputLabel>
            <Select value={filterAction} label="Action" onChange={e => setFilterAction(e.target.value)}>
              <MenuItem value="">All actions</MenuItem>
              {Object.entries(ACTION_LABELS).map(([val, label]) => (
                <MenuItem key={val} value={val}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Resource type</InputLabel>
            <Select value={filterResourceType} label="Resource type" onChange={e => setFilterResourceType(e.target.value)}>
              <MenuItem value="">All types</MenuItem>
              {RESOURCE_TYPES.map(t => (
                <MenuItem key={t} value={t}>{t.replace('_', ' ')}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small" label="From date" type="date" value={filterFromDate}
            onChange={e => setFilterFromDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small" label="To date" type="date" value={filterToDate}
            onChange={e => setFilterToDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {hasFilters && (
            <Button
              variant="secondary"
              className="border-current"
              onClick={() => {
                setFilterAction('');
                setFilterResourceType('');
                setFilterFromDate('');
                setFilterToDate('');
              }}
            >
              Clear filters
            </Button>
          )}
        </Box>

        <Divider />

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
                  <TableCell>IP</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        {loading ? 'Loading…' : 'No audit log entries found.'}
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
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace" sx={{ fontSize: '0.7rem' }}>
                        {log.ip_address || '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Box>

        {/* Pagination */}
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
