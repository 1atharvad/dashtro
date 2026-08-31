import { Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { ACTION_COLORS, ACTION_LABELS } from '@ts/data/content';

export type AuditLogRow = {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  created_at: string;
  ip_address?: string;
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

export const AuditLogTable = ({
  logs,
  loading,
  showIpColumn = true,
  emptyMessage = 'No audit log entries found.',
}: {
  logs: AuditLogRow[];
  loading: boolean;
  showIpColumn?: boolean;
  emptyMessage?: string;
}) => (
  <Box className="settings-table">
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Timestamp</TableCell>
          <TableCell>User</TableCell>
          <TableCell>Action</TableCell>
          <TableCell>Resource</TableCell>
          <TableCell>Name</TableCell>
          {showIpColumn && <TableCell>IP</TableCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {logs.length === 0 && (
          <TableRow>
            <TableCell colSpan={showIpColumn ? 6 : 5}>
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                {loading ? 'Loading…' : emptyMessage}
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
            {showIpColumn && (
              <TableCell>
                <Typography variant="body2" color="text.secondary" fontFamily="monospace" sx={{ fontSize: '0.7rem' }}>
                  {log.ip_address || '—'}
                </Typography>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </Box>
);
