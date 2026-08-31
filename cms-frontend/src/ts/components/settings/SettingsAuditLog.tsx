import { useCallback, useEffect, useState } from 'react';
import { Box, Divider, IconButton, Tooltip, Typography } from '@mui/material';
import { Download, RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { AuditHeatmap } from './AuditHeatmap';
import { AuditLogFilters } from './AuditLogFilters';
import { AuditLogTable, type AuditLogRow } from './AuditLogTable';
import { AuditLogPagination } from './AuditLogPagination';
import { AUDIT_PAGE_SIZE } from '@ts/data/content';

type LogsResponse = {
  total: number;
  logs: AuditLogRow[];
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
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
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

        <AuditLogFilters
          filterAction={filterAction}
          filterResourceType={filterResourceType}
          filterFromDate={filterFromDate}
          filterToDate={filterToDate}
          onFilterActionChange={setFilterAction}
          onFilterResourceTypeChange={setFilterResourceType}
          onFilterFromDateChange={setFilterFromDate}
          onFilterToDateChange={setFilterToDate}
          onClear={() => {
            setFilterAction('');
            setFilterResourceType('');
            setFilterFromDate('');
            setFilterToDate('');
          }}
        />

        <Divider />

        <Box className="settings-section-body" sx={{ pt: '0 !important' }}>
          <AuditLogTable logs={logs} loading={loading} />
        </Box>

        <AuditLogPagination
          total={total}
          page={page}
          totalPages={totalPages}
          loading={loading}
          onPrev={() => fetchLogs(page - 1)}
          onNext={() => fetchLogs(page + 1)}
        />
      </Box>
    </Box>
  );
};
