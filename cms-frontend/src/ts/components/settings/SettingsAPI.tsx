import { useEffect, useState } from 'react';
import {
  Box, IconButton, Tooltip, Typography,
  Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { Key, Copy, Trash2, Eye, EyeOff } from 'lucide-react';
import { Button } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { useUser } from '@ts/context/UserContext';

type ApiKey = {
  id: string;
  label: string;
  key: string;
  created_by: string;
  created_at: string;
};

export const SettingsAPI = () => {
  const { user: currentUser } = useUser();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  const canManage = currentUser?.role === 'Owner' || currentUser?.role === 'Admin';

  const load = () => {
    authFetch(`${API_BASE_URL}/auth/api-keys/`)
      .then(r => r.ok ? r.json() : [])
      .then(setApiKeys)
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    await authFetch(`${API_BASE_URL}/auth/api-keys/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    setCreateOpen(false);
    setNewLabel('');
    load();
  };

  const handleDelete = async (id: string) => {
    await authFetch(`${API_BASE_URL}/auth/api-keys/${id}/`, { method: 'DELETE' });
    load();
  };

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

  const copyUrl = () => {
    navigator.clipboard.writeText(API_BASE_URL || '');
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 1500);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Base URL section */}
      <Box className="settings-section">
        <Box className="settings-section-header">
          <Typography variant="subtitle1" fontWeight={700}>API Base URL</Typography>
          <Typography variant="body2" color="text.secondary">Use this URL as the root for all API requests</Typography>
        </Box>
        <Box className="settings-section-body">
          <TextField
            label="API Base URL"
            value={API_BASE_URL}
            fullWidth
            disabled
            slotProps={{
              inputLabel: { shrink: true },
              input: {
                endAdornment: (
                  <Tooltip title={urlCopied ? 'Copied!' : 'Copy URL'}>
                    <IconButton size="small" onClick={copyUrl}>
                      <Copy className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                ),
              },
            }}
          />
        </Box>
      </Box>

      {/* API Keys section */}
      <Box className="settings-section">
        <Box className="settings-section-header" sx={{ flexDirection: 'row !important', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>API Keys</Typography>
            <Typography variant="body2" color="text.secondary">Keys used to authenticate requests to this CMS instance</Typography>
          </Box>
          {canManage && (
            <Button variant="default" className="border-current" onClick={() => setCreateOpen(true)}>
              <Key className="h-4 w-4" /> Create API Key
            </Button>
          )}
        </Box>

        <Box className="settings-section-body" sx={{ pt: '0 !important' }}>
          <Box className="settings-table">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Label</TableCell>
                  <TableCell>Key</TableCell>
                  <TableCell>Created</TableCell>
                  {canManage && <TableCell align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {apiKeys.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManage ? 4 : 3}>
                      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                        No API keys yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {apiKeys.map(k => {
                  const revealed = revealedIds.has(k.id);
                  return (
                    <TableRow key={k.id}>
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
                        <Typography variant="body2" color="text.secondary">{formatDate(k.created_at)}</Typography>
                      </TableCell>
                      {canManage && (
                        <TableCell align="right">
                          <Tooltip title="Delete key">
                            <IconButton size="small" onClick={() => handleDelete(k.id)}>
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </Box>
      </Box>

      {/* Create API Key Dialog */}
      <Dialog open={createOpen} onClose={() => { setCreateOpen(false); setNewLabel(''); }} fullWidth maxWidth="xs">
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary">
            Give this key a descriptive label so you can identify it later.
          </Typography>
          <TextField
            fullWidth size="small" label="Label" placeholder="e.g. Production, Mobile App"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" className="border-current" onClick={() => { setCreateOpen(false); setNewLabel(''); }}>
            Cancel
          </Button>
          <Button variant="default" className="border-current" onClick={handleCreate} disabled={!newLabel.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
