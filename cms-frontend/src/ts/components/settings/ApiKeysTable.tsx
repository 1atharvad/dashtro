import { useState } from 'react';
import {
  Box, Chip, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { Ban, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';

export type ApiKey = {
  id: string;
  label: string;
  key: string;
  created_by: string;
  created_at: string;
  project_id: string | null;
  collections: string[];
  scopes: string[];
  revoked_at: string | null;
  last_used_at: string | null;
};

const formatDate = (iso: string | null) => {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

export const ApiKeysTable = ({
  apiKeys,
  canManage,
  projectName,
  onRevoke,
  onDelete,
}: {
  apiKeys: ApiKey[];
  canManage: boolean;
  projectName: (id: string | null) => string;
  onRevoke: (id: string) => void;
  onDelete: (id: string) => void;
}) => {
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleReveal = (id: string) => {
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyKey = (id: string, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <Box className="settings-table">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Label</TableCell>
            <TableCell>Key</TableCell>
            <TableCell>Project</TableCell>
            <TableCell>Scopes</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>Last Used</TableCell>
            {canManage && <TableCell align="right" />}
          </TableRow>
        </TableHead>
        <TableBody>
          {apiKeys.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 8 : 7}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  No API keys yet.
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {apiKeys.map(k => {
            const revealed = revealedIds.has(k.id);
            const revoked = !!k.revoked_at;
            return (
              <TableRow key={k.id} sx={revoked ? { opacity: 0.55 } : undefined}>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{k.label}</Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" fontFamily="monospace" sx={{ letterSpacing: revealed ? 'normal' : '0.1em' }}>
                      {revealed ? k.key : '••••••••••••••••'}
                    </Typography>
                    <Tooltip title={revealed ? 'Hide' : 'Reveal'}>
                      <IconButton size="small" onClick={() => toggleReveal(k.id)}>
                        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={copiedId === k.id ? 'Copied!' : 'Copy key'}>
                      <IconButton size="small" onClick={() => copyKey(k.id, k.key)}>
                        <Copy className="h-3.5 w-3.5" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{projectName(k.project_id)}</Typography>
                  {k.collections?.length > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {k.collections.join(', ')}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {(k.scopes ?? []).map(s => (
                      <Chip key={s} label={s} size="small" variant="outlined" />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip
                    label={revoked ? 'Revoked' : 'Active'}
                    size="small"
                    color={revoked ? 'default' : 'success'}
                    variant={revoked ? 'outlined' : 'filled'}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{formatDate(k.created_at)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">{formatDate(k.last_used_at)}</Typography>
                </TableCell>
                {canManage && (
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {!revoked && (
                        <Tooltip title="Revoke key">
                          <IconButton size="small" onClick={() => onRevoke(k.id)}>
                            <Ban className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Delete key">
                        <IconButton size="small" onClick={() => onDelete(k.id)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
};
