import { useCallback, useEffect, useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { RefreshCw } from 'lucide-react';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { AUDIT_PAGE_SIZE } from '@ts/data/content';
import { AuditHeatmap } from './AuditHeatmap';
import { AuditLogTable, type AuditLogRow } from './AuditLogTable';
import { AuditLogPagination } from './AuditLogPagination';

type LogsResponse = {
  total: number;
  logs: AuditLogRow[];
};

/** Audit log activity for a single project, scoped via ?project_id= on the shared audit-logs endpoint. */
export const ProjectAuditLog = ({ projectId }: { projectId: string }) => {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
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
          <AuditLogTable
            logs={logs}
            loading={loading}
            showIpColumn={false}
            emptyMessage="No audit log entries found for this project."
          />
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
