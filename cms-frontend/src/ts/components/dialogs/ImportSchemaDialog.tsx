import { useRef, useState } from 'react';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Button } from 'advi-ui';
import { Upload } from 'lucide-react';

const readFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });

export type ImportedSchemaFile = { fields: Record<string, unknown>[]; folderName?: string };

export const ImportSchemaDialog = ({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (files: ImportedSchemaFile[]) => Promise<void> | void;
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setFiles([]);
    setError('');
    onClose();
  };

  const handleImport = async () => {
    setError('');
    if (!files.length) { setError('Please select at least one JSON file.'); return; }

    try {
      const parsedFiles: ImportedSchemaFile[] = [];
      for (const file of files) {
        const text = await readFile(file);
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsedFiles.push({ fields: parsed });
        } else if (parsed && Array.isArray(parsed.fields)) {
          parsedFiles.push({ fields: parsed.fields, folderName: parsed._folder || undefined });
        } else {
          throw new Error(`${file.name}: expected a JSON array or an object with a "fields" array.`);
        }
      }
      await onImport(parsedFiles);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Import Schema from JSON</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Select one or more <code>.json</code> files. Use <strong>Download Schema</strong> to get the correct format.
        </Typography>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            setFiles(Array.from(e.target.files ?? []));
            setError('');
          }}
        />
        <Box
          onClick={() => fileRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: error ? 'error.main' : 'divider',
            borderRadius: 2,
            px: 3, py: 4,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
            cursor: 'pointer',
            '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
          }}
        >
          <Upload className="h-6 w-6" style={{ opacity: 0.5 }} />
          {files.length > 0 ? (
            <Box sx={{ textAlign: 'center' }}>
              {files.map(f => (
                <Typography key={f.name} variant="body2" fontWeight={500}>{f.name}</Typography>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">Click to select JSON file(s)</Typography>
          )}
        </Box>
        {error && (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{error}</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="default" onClick={handleImport} disabled={!files.length}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};
