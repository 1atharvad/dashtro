import { useRef, useState } from 'react';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { Button } from 'advi-ui';
import { Upload, X } from 'lucide-react';

export const ImportDocumentDialog = ({
  open,
  onClose,
  schemaFieldNames,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  schemaFieldNames: string[];
  onImport: (data: Record<string, unknown>) => void;
}) => {
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setError('');
    onClose();
  };

  const handleFile = (file: File) => {
    setError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected a JSON object.');
        const fieldSet = new Set(schemaFieldNames);
        const filtered: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(parsed)) {
          if (fieldSet.has(key)) filtered[key] = val;
        }
        onImport(filtered);
        handleClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid JSON');
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        Import Document from JSON
        <IconButton size="small" onClick={handleClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select a <code>.json</code> file exported from another document. Only fields matching this document's schema will be imported.
        </Typography>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <Box
          onClick={() => fileRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: error ? 'error.main' : 'divider',
            borderRadius: 2, px: 3, py: 4, cursor: 'pointer', textAlign: 'center',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <Upload className="h-6 w-6" style={{ opacity: 0.4, margin: '0 auto 8px' }} />
          <Typography variant="body2" color="text.secondary">Click to select a JSON file</Typography>
        </Box>
        {error && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="secondary" onClick={handleClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
