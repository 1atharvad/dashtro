import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Tooltip, IconButton } from '@mui/material';
import { Plus } from 'lucide-react';
import { AppHeader } from '@ts/components/AppHeader';
import { RtdbTreeNode, RtdbAddKeyForm } from '@ts/components/RtdbTreeNode';
import { useRealtimeDb } from '@/hooks/useRealtimeDb';
import '@/scss/RealtimeDatabase.scss';

export const RealtimeDatabase = () => {
  const { project_id } = useParams<{ project_id: string }>();
  const { tree, loading, connected, setPath, removePath, renamePath } = useRealtimeDb(project_id ?? '');
  const [addingKey, setAddingKey] = useState(false);

  const entries = Object.entries(tree ?? {});

  return (
    <Box className="rtdb-page">
      <AppHeader />
      <Box className="rtdb-body">
        <Box className="rtdb-header">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h5" fontWeight={700}>Realtime Database</Typography>
            <Tooltip title={connected ? 'Live — connected' : 'Offline'}>
              <Box className={`rtdb-status-dot ${connected ? 'rtdb-status-dot--live' : ''}`} />
            </Tooltip>
          </Box>
          <Tooltip title="Add key">
            <IconButton onClick={() => setAddingKey(true)}><Plus className="h-4 w-4" /></IconButton>
          </Tooltip>
        </Box>

        {!loading && (
          <Box className="rtdb-tree">
            {entries.length === 0 && !addingKey && (
              <Typography color="text.secondary" variant="body2" sx={{ p: 2 }}>
                No keys yet. Add a key to get started.
              </Typography>
            )}
            {entries.map(([key, value]) => (
              <RtdbTreeNode
                key={key}
                nodeKey={key}
                path={key}
                value={value}
                depth={0}
                siblingKeys={entries.map(([k]) => k).filter(k => k !== key)}
                onSetPath={setPath}
                onDeletePath={removePath}
                onRenamePath={renamePath}
              />
            ))}
            {addingKey && (
              <RtdbAddKeyForm
                existingKeys={entries.map(([k]) => k)}
                onAdd={(key, value, raw) => { setPath(key, value, raw); setAddingKey(false); }}
                onCancel={() => setAddingKey(false)}
              />
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};
