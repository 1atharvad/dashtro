import '@uiw/react-md-editor/markdown-editor.css';
import { useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import {
  Box, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Button } from 'advi-ui';
import { Pencil, X } from 'lucide-react';

// Legacy array values become newline-joined text — literal text, no HTML parsing.
const toEditorText = (value: string | string[]): string =>
  Array.isArray(value) ? value.join('\n') : (value || '');

const EditorInner = ({
  value,
  onSave,
  onClose,
  disabled,
}: {
  value: string | string[];
  onSave: (text: string) => void;
  onClose: () => void;
  disabled: boolean;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [text, setText] = useState(() => toEditorText(value));

  const handleSave = () => {
    onSave(text);
    onClose();
  };

  return (
    <>
      <DialogContent sx={{ p: 0, overflow: 'hidden' }} data-color-mode={isDark ? 'dark' : 'light'}>
        <Box className="rich-text-body" sx={{ border: 'none', borderRadius: 0 }}>
          <MDEditor
            value={text}
            onChange={v => setText(v ?? '')}
            preview="edit"
            visibleDragbar={false}
            height={400}
            textareaProps={{ disabled }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button variant="secondary" onClick={onClose}>
          {disabled ? 'Close' : 'Cancel'}
        </Button>
        {!disabled && (
          <Button variant="default" onClick={handleSave}>
            Save
          </Button>
        )}
      </DialogActions>
    </>
  );
};

// Preview: newlines become <br> so inline HTML (spans/links) still renders as-is.
const toPreviewHtml = (value: any): string => {
  if (typeof value === 'string') return value.replace(/\n/g, '<br>');
  if (Array.isArray(value)) {
    return value
      .filter((i): i is string => typeof i === 'string')
      .join('<br>');
  }
  return '';
};

export const RichTextModal = ({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const previewHtml = toPreviewHtml(value);
  const editorValue: string | string[] = Array.isArray(value) ? value : (typeof value === 'string' ? value : '');

  return (
    <Box className="rich-text-field">
      <label className="nested-variable-label" style={{ marginBottom: 8 }}>{label}</label>
      <Box
        onClick={() => setOpen(true)}
        sx={{
          position: 'relative',
          border: '1px solid var(--cms-border)',
          borderRadius: 2,
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          minHeight: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          transition: 'border-color 0.15s',
          '&:hover': { borderColor: 'var(--cms-text-muted)' },
        }}
      >
        {previewHtml ? (
          <Box
            className="rich-text-preview"
            sx={{ flex: 1, fontSize: '0.875rem', lineHeight: 1.6, overflow: 'hidden', pointerEvents: 'none' }}
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : (
          <Typography variant="body2" color="text.disabled" sx={{ flex: 1 }}>
            No content — click to edit
          </Typography>
        )}
        <IconButton
          size="small"
          sx={{ flexShrink: 0, opacity: 0.5 }}
          onClick={e => { e.stopPropagation(); setOpen(true); }}
        >
          <Pencil className="h-4 w-4" />
        </IconButton>
      </Box>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
        keepMounted={false}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={600}>{label}</Typography>
          <IconButton size="small" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </IconButton>
        </DialogTitle>

        {open && (
          <EditorInner
            value={editorValue}
            onSave={onChange}
            onClose={() => setOpen(false)}
            disabled={!!disabled}
          />
        )}
      </Dialog>
    </Box>
  );
};
