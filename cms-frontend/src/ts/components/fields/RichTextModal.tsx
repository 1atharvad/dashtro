import '@uiw/react-md-editor/markdown-editor.css';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import MDEditor from '@uiw/react-md-editor';
import {
  Box, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Button } from 'advi-ui';
import { Pencil, X, Eye } from 'lucide-react';
import type { AppDispatch, RootState, RichTextComponent } from '@ts/types/constants';
import { fetchRichTextComponents } from '@/redux/richTextComponentSlice';
import { RichTextWrapperRenderer } from '@ts/config/richTextWrapper';

// Legacy array values become newline-joined text — literal text, no HTML parsing.
const toEditorText = (value: string | string[]): string =>
  Array.isArray(value) ? value.join('\n') : (value || '');

const EditorInner = ({
  value,
  onSave,
  onClose,
  disabled,
  wrapperKey,
  customComponents,
}: {
  value: string | string[];
  onSave: (text: string) => void;
  onClose: () => void;
  disabled: boolean;
  wrapperKey?: string;
  customComponents: RichTextComponent[];
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [text, setText] = useState(() => toEditorText(value));
  const [previewOpen, setPreviewOpen] = useState(false);

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
        <Button variant="secondary" onClick={() => setPreviewOpen(true)} style={{ marginRight: 'auto' }}>
          <Eye className="h-4 w-4" /> Preview
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {disabled ? 'Close' : 'Cancel'}
        </Button>
        {!disabled && (
          <Button variant="default" onClick={handleSave}>
            Save
          </Button>
        )}
      </DialogActions>

      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} fullWidth maxWidth="md">
        <DialogTitle className="rich-text-dialog-title">
          <Typography fontWeight={600}>Preview</Typography>
          <IconButton size="small" onClick={() => setPreviewOpen(false)}>
            <X className="h-4 w-4" />
          </IconButton>
        </DialogTitle>
        <DialogContent className="rich-text-preview-content">
          <Box className="rich-text-preview-canvas">
            <RichTextWrapperRenderer wrapperKey={wrapperKey} source={text} customComponents={customComponents} />
          </Box>
        </DialogContent>
      </Dialog>
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
  const { project_id } = useParams<{ project_id: string }>();
  const dispatch = useDispatch<AppDispatch>();
  const byProject = useSelector((state: RootState) => state.richTextComponents.byProject);
  const customComponents = useMemo(
    () => byProject[project_id ?? ''] ?? [],
    [byProject, project_id]
  );

  useEffect(() => {
    if (project_id) dispatch(fetchRichTextComponents(project_id));
  }, [dispatch, project_id]);

  const editorValue: string | string[] = Array.isArray(value) ? value : (typeof value === 'string' ? value : '');
  const previewSource = editorValue ? (Array.isArray(editorValue) ? editorValue.join('\n') : editorValue) : '';

  return (
    <Box className="rich-text-field">
      <label className="nested-variable-label" style={{ marginBottom: 8 }}>{label}</label>
      <Box className="rich-text-trigger" onClick={() => setOpen(true)}>
        {previewSource ? (
          <Box className="rich-text-preview">
            <RichTextWrapperRenderer wrapperKey={wrapperKey} source={previewSource} customComponents={customComponents} />
          </Box>
        ) : (
          <Typography variant="body2" color="text.disabled" className="rich-text-empty">
            No content — click to edit
          </Typography>
        )}
        <IconButton
          size="small"
          className="rich-text-edit-btn"
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
        <DialogTitle className="rich-text-dialog-title">
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
            wrapperKey={wrapperKey}
            customComponents={customComponents}
          />
        )}
      </Dialog>
    </Box>
  );
};
