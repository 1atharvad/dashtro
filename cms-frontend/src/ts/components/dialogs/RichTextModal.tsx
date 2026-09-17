import '@uiw/react-md-editor/markdown-editor.css';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import MDEditor from '@uiw/react-md-editor';
import {
  Box, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Button } from 'advi-ui';
import { Pencil, X, Eye } from 'lucide-react';
import { useRichTextComponentsQuery } from '@ts/api/richTextComponents';
import { RichTextWrapperRenderer } from '@ts/components/RichTextWrapper';

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
      <DialogContent className="rich-text-dialog-content" data-color-mode={isDark ? 'dark' : 'light'}>
        <Box className="rich-text-body rich-text-body--flat">
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
      <DialogActions className="rich-text-dialog-actions">
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

export const RichTextModal = ({
  label,
  value,
  onChange,
  disabled = false,
  wrapperKey,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  disabled?: boolean;
  wrapperKey?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');
  const { project_id } = useParams<{ project_id: string }>();
  const { data: customComponents = [], isLoading: componentsLoading } = useRichTextComponentsQuery(project_id ?? '');

  const editorValue: string | string[] = Array.isArray(value) ? value : (typeof value === 'string' ? value : '');
  const previewSource = editorValue ? (Array.isArray(editorValue) ? editorValue.join('\n') : editorValue) : '';

  return (
    <Box className="rich-text-field">
      <label className="nested-variable-label" style={{ marginBottom: 8 }}>{label}</label>
      <Box className="rich-text-trigger" onClick={() => setOpen(true)}>
        {previewSource ? (
          <>
            <Box className="rich-text-preview">
              <RichTextWrapperRenderer wrapperKey={wrapperKey} source={previewSource} customComponents={customComponents} componentsLoading={componentsLoading} />
            </Box>
            <IconButton
              size="small"
              className="rich-text-preview-btn"
              onClick={e => { e.stopPropagation(); setPreviewOpen(true); }}
              aria-label="Preview rich text"
            >
              <Eye className="h-4 w-4" />
            </IconButton>
          </>
        ) : (
          <Typography variant="body2" color="text.disabled" className="rich-text-empty">
            No content — click to edit
          </Typography>
        )}
        <IconButton
          size="small"
          className="rich-text-edit-btn"
          onClick={e => { e.stopPropagation(); setOpen(true); }}
          aria-label="Edit rich text"
        >
          <Pencil className="h-4 w-4" />
        </IconButton>
      </Box>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle className="rich-text-dialog-title">
          <Typography fontWeight={600}>Preview</Typography>
          <Box className="rich-text-preview-header-actions">
            <TextField
              select
              size="small"
              className="rich-text-preview-mode-select"
              value={previewMode}
              onChange={e => setPreviewMode(e.target.value as 'light' | 'dark')}
            >
              <MenuItem value="light">Light</MenuItem>
              <MenuItem value="dark">Dark</MenuItem>
            </TextField>
            <IconButton size="small" onClick={() => setPreviewOpen(false)} aria-label="Close preview">
              <X className="h-4 w-4" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent className="rich-text-preview-content">
          <Box
            className={`rich-text-preview-canvas${previewMode === 'dark' ? ' rich-text-preview-canvas--dark' : ''}`}
            data-color-mode={previewMode}
          >
            <RichTextWrapperRenderer
              wrapperKey={wrapperKey}
              source={previewSource}
              customComponents={customComponents}
              componentsLoading={componentsLoading}
            />
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
        keepMounted={false}
      >
        <DialogTitle className="rich-text-dialog-title">
          <Typography fontWeight={600}>{label}</Typography>
          <IconButton size="small" onClick={() => setOpen(false)} aria-label="Close editor">
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
