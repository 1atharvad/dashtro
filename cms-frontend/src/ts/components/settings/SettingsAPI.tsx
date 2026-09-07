import { useEffect, useState } from 'react';
import { Box, IconButton, Tooltip, Typography, TextField } from '@mui/material';
import { Key, Copy } from 'lucide-react';
import { Button } from 'advi-ui';
import { API_BASE_URL, SDK_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { useUser } from '@ts/context/userContextValue';
import { useProjectData } from '@/hooks/useProject';
import { ApiKeysTable, type ApiKey } from '@ts/components/settings/ApiKeysTable';
import { CreateApiKeyDialog, type NewApiKeyInput } from '@ts/components/dialogs/CreateApiKeyDialog';

export const SettingsAPI = () => {
  const { user: currentUser } = useUser();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
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

  const handleCreate = async (input: NewApiKeyInput) => {
    await authFetch(`${API_BASE_URL}/auth/api-keys/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: input.label,
        project_id: input.projectId || null,
        collections: input.collections,
        scopes: input.scopes,
      }),
    });
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

  const copyUrl = () => {
    navigator.clipboard.writeText(SDK_BASE_URL || '');
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 1500);
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
            value={SDK_BASE_URL}
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
            <Button variant="default" onClick={() => setCreateOpen(true)}>
              <Key className="h-4 w-4" /> Create API Key
            </Button>
          )}
        </Box>

        <Box className="settings-section-body" sx={{ pt: '0 !important' }}>
          <ApiKeysTable
            apiKeys={apiKeys}
            canManage={canManage}
            projectName={projectName}
            onRevoke={handleRevoke}
            onDelete={handleDelete}
          />
        </Box>
      </Box>

      <CreateApiKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        projects={projects}
        onCreate={handleCreate}
      />
    </Box>
  );
};
