import { useRef, useState } from 'react';
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { Button, toast } from 'advi-ui';

const validateWsName = (v: string) => {
  if (!v) return '';
  if (v === 'production') return "'production' is reserved.";
  if (!/^[a-z][a-z0-9_-]*$/.test(v)) return 'Lowercase letters, numbers, hyphens, underscores only.';
  return '';
};

export const CreateWorkspaceDialog = ({
  open,
  onClose,
  addWorkspace,
}: {
  open: boolean;
  onClose: () => void;
  addWorkspace: (name: string) => Promise<unknown>;
}) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setName('');
    setError('');
    onClose();
  };

  const handleCreate = () => {
    if (!name.trim() || error) return;
    addWorkspace(name.trim()).catch(err => {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to create workspace');
    });
    handleClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth maxWidth="xs"
      slotProps={{ transition: { onEntered: () => inputRef.current?.focus() } }}
    >
      <DialogTitle>New Workspace</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth size="small" label="Workspace name"
          inputRef={inputRef}
          value={name}
          onChange={e => {
            const v = e.target.value.toLowerCase().replace(/\s/g, '-');
            setName(v);
            setError(validateWsName(v));
          }}
          error={!!error}
          helperText={error || 'Lowercase letters, numbers, hyphens, underscores.'}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="default" onClick={handleCreate} disabled={!name.trim() || !!error}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};
