import { useEffect, useState } from 'react';
import {
  Box, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, MenuItem, TextField, Typography,
} from '@mui/material';
import { Button } from 'advi-ui';
import { useCollectionData } from '@/hooks/useCollection';

export type NewApiKeyInput = {
  label: string;
  projectId: string;
  collections: string[];
  scopes: string[];
};

export const CreateApiKeyDialog = ({
  open,
  onClose,
  projects,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  projects: { _id: string; name: string }[];
  onCreate: (input: NewApiKeyInput) => Promise<unknown>;
}) => {
  const [label, setLabel] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [scopes, setScopes] = useState<string[]>(['read']);

  const { collections } = useCollectionData(projectId);
  const collectionOptions = collections.map(c => c._collection_name);

  useEffect(() => {
    setSelectedCollections([]);
  }, [projectId]);

  const reset = () => {
    setLabel('');
    setProjectId('');
    setSelectedCollections([]);
    setScopes(['read']);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleScope = (scope: string) => {
    setScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]);
  };

  const toggleCollection = (name: string) => {
    setSelectedCollections(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  };

  const handleCreate = async () => {
    if (!label.trim()) return;
    await onCreate({ label: label.trim(), projectId, collections: selectedCollections, scopes });
    handleClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>Create API Key</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <Typography variant="body2" color="text.secondary">
          Give this key a descriptive label, then scope it to a project, collections, and operations.
        </Typography>
        <TextField
          fullWidth size="small" label="Label" placeholder="e.g. Production, Mobile App"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          autoFocus
        />
        <TextField
          fullWidth size="small" select label="Project" value={projectId}
          onChange={e => setProjectId(e.target.value)}
          helperText="Leave unscoped to allow access to all projects"
        >
          <MenuItem value="">All projects</MenuItem>
          {projects.map(p => (
            <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
          ))}
        </TextField>
        {projectId && collectionOptions.length > 0 && (
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
                      checked={selectedCollections.includes(name)}
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
              control={<Checkbox size="small" checked={scopes.includes('read')} onChange={() => toggleScope('read')} />}
              label={<Typography variant="body2">Read</Typography>}
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={scopes.includes('write')} onChange={() => toggleScope('write')} />}
              label={<Typography variant="body2">Write</Typography>}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="default" onClick={handleCreate} disabled={!label.trim() || scopes.length === 0}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};
