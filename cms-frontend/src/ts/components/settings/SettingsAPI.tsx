import { useEffect, useState } from 'react';
import {
  Box, IconButton, Tooltip, Typography,
  Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Checkbox, FormControlLabel, Chip,
} from '@mui/material';
import { Key, Copy, Trash2, Eye, EyeOff, Ban } from 'lucide-react';
import { Button } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { useUser } from '@ts/context/userContextValue';
import { useProjectData } from '@/hooks/useProject';
import { useCollectionData } from '@/hooks/useCollection';

type ApiKey = {
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

export const SettingsAPI = () => {
  const { user: currentUser } = useUser();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newCollections, setNewCollections] = useState<string[]>([]);
  const [newScopes, setNewScopes] = useState<string[]>(['read']);
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

  const { projects } = useProjectData();
  const { collections } = useCollectionData(newProjectId);
  const collectionOptions = collections.map(c => c._collection_name);

  useEffect(() => {
    setNewCollections([]);
  }, [newProjectId]);

  const resetCreateForm = () => {
    setCreateOpen(false);
    setNewLabel('');
    setNewProjectId('');
    setNewCollections([]);
    setNewScopes(['read']);
  };

  const handleCreate = async () => {
    if (!newLabel.trim()) return;
    await authFetch(`${API_BASE_URL}/auth/api-keys/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: newLabel.trim(),
        project_id: newProjectId || null,
        collections: newCollections,
        scopes: newScopes,
      }),
    });
    resetCreateForm();
    load();
  };

  const handleDelete = async (id: string) => {
    await authFetch(`${API_BASE_URL}/auth/api-keys/${id}/`, { method: 'DELETE' });
    load();
  };

  const handleRevoke = async (id: string) => {
    await authFetch(`${API_BASE_URL}/auth/api-keys/${id}/revoke/`, { method: 'PATCH' });
    load();
  };

  const toggleScope = (scope: string) => {
    setNewScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const toggleCollection = (name: string) => {
    setNewCollections(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
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

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Never';
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const projectName = (id: string | null) => {
    if (!id) return 'All projects';
    return projects.find(p => p._id === id)?.name ?? id;
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
            <Typography variant="body2" color="text.secondary">Keys used to authenticate SDK requests, scoped by project, collection, and operation</Typography>
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
                                <IconButton size="small" onClick={() => handleRevoke(k.id)}>
                                  <Ban className="h-4 w-4" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="Delete key">
                              <IconButton size="small" onClick={() => handleDelete(k.id)}>
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
        </Box>
      </Box>

      {/* Create API Key Dialog */}
      <Dialog open={createOpen} onClose={resetCreateForm} fullWidth maxWidth="xs">
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary">
            Give this key a descriptive label, then scope it to a project, collections, and operations.
          </Typography>
          <TextField
            fullWidth size="small" label="Label" placeholder="e.g. Production, Mobile App"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
            autoFocus
          />
          <TextField
            fullWidth size="small" select label="Project" value={newProjectId}
            onChange={e => setNewProjectId(e.target.value)}
            helperText="Leave unscoped to allow access to all projects"
          >
            <MenuItem value="">All projects</MenuItem>
            {projects.map(p => (
              <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
            ))}
          </TextField>
          {newProjectId && collectionOptions.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Collections</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Leave all unchecked to allow access to every collection in this project
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {collectionOptions.map(name => (
                  <FormControlLabel
                    key={name}
                    control={
                      <Checkbox
                        size="small"
                        checked={newCollections.includes(name)}
                        onChange={() => toggleCollection(name)}
                      />
                    }
                    label={<Typography variant="body2">{name}</Typography>}
                  />
                ))}
              </Box>
            </Box>
          )}
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>Operations</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={newScopes.includes('read')} onChange={() => toggleScope('read')} />}
                label={<Typography variant="body2">Read</Typography>}
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={newScopes.includes('write')} onChange={() => toggleScope('write')} />}
                label={<Typography variant="body2">Write</Typography>}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" className="border-current" onClick={resetCreateForm}>
            Cancel
          </Button>
          <Button variant="default" className="border-current" onClick={handleCreate} disabled={!newLabel.trim() || newScopes.length === 0}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
