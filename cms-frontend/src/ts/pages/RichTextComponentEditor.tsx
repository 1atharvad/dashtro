import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Box, TextField, Typography } from '@mui/material';
import { Trash2 } from 'lucide-react';
import { Button, toast } from 'advi-ui';
import MonacoEditor from '@monaco-editor/react';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import type { AppDispatch, RootState } from '@ts/types/constants';
import {
  fetchRichTextComponents, updateRichTextComponent, deleteRichTextComponent,
} from '@/redux/richTextComponentSlice';
import { ADVI_WRAPPER_COMPONENTS } from '@ts/config/adviWrapperComponents';
import { DEFAULT_SAMPLE_HTML } from '@ts/config/richTextComponentDefaults';
import { AppHeader } from '@ts/components/AppHeader';
import { PageForm } from '@ts/components/PageForm';
import { ModalContentBtn } from '@ts/components/ModalContentBtn';
import '@/scss/DocCollection.scss';
import '@/scss/RichTextComponents.scss';

// Shared so the sample-content and source editors look and behave identically.
// `acceptSuggestionOnEnter: 'off'` + `quickSuggestions: false` keep Enter as a
// plain newline — otherwise the HTML language service's autocomplete widget
// (triggered by tags/attributes) swallows Enter to accept a suggestion instead.
const MONACO_EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  lineNumbers: 'on' as const,
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  tabSize: 2,
  automaticLayout: true,
  padding: { top: 16 },
  quickSuggestions: false,
  acceptSuggestionOnEnter: 'off' as const,
};

const SPLIT_STORAGE_KEY = 'rtcEditorSplit';
const DEFAULT_SPLIT_PERCENT = 60;
const MIN_SPLIT_PERCENT = 20;
const MAX_SPLIT_PERCENT = 80;

export const RichTextComponentEditor = () => {
  const { project_id, component_id } = useParams<{ project_id: string; component_id: string }>();
  const isNew = component_id === 'new';
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const components = useSelector(
    (state: RootState) => state.richTextComponents.byProject[project_id ?? ''] ?? []
  );

  const existing = useMemo(
    () => (!isNew ? components.find(c => c.id === component_id) ?? null : null),
    [components, component_id, isNew]
  );

  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [css, setCss] = useState('');
  const [deleteClose, setDeleteClose] = useState(false);
  const [sampleHtml, setSampleHtml] = useState(DEFAULT_SAMPLE_HTML);

  // Sample content is raw author-supplied HTML (not JSX), same trust level as
  // the source editor's JS — both run live in this sandboxed preview.
  const sampleChildren = useMemo(() => (
    <div dangerouslySetInnerHTML={{ __html: sampleHtml }} />
  ), [sampleHtml]);

  // Draggable code-row/preview split (vertical), persisted like the sidebar's
  // collapsed state.
  const [splitPercent, setSplitPercent] = useState(() => {
    const saved = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
    return saved >= MIN_SPLIT_PERCENT && saved <= MAX_SPLIT_PERCENT ? saved : DEFAULT_SPLIT_PERCENT;
  });
  const splitPercentRef = useRef(splitPercent);
  splitPercentRef.current = splitPercent;
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const percent = ((event.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(MAX_SPLIT_PERCENT, Math.max(MIN_SPLIT_PERCENT, percent)));
    };
    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(SPLIT_STORAGE_KEY, String(splitPercentRef.current));
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizeStart = () => {
    isResizingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (project_id) dispatch(fetchRichTextComponents(project_id));
  }, [dispatch, project_id]);

  // Components are now named and created via the modal on the list page,
  // so there's nothing to edit at the "new" route — send the user back.
  useEffect(() => {
    if (isNew && project_id) navigate(`/projects/${project_id}/schema/components/`, { replace: true });
  }, [isNew, project_id, navigate]);

  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setSource(existing.source);
      setCss(existing.css);
      setSampleHtml(existing.sampleHtml || DEFAULT_SAMPLE_HTML);
    }
  }, [existing]);

  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    if (!project_id || !existing || !name.trim()) return;
    dispatch(updateRichTextComponent({ projectId: project_id, componentId: existing.id, name, source, css, sampleHtml }))
      .unwrap()
      .then(() => toast.success('Component saved.'))
      .catch((err: Error) => toast.error(err.message));
  };

  const handleDelete = () => {
    if (!project_id || !existing) return;
    dispatch(deleteRichTextComponent({ projectId: project_id, componentId: existing.id }));
    navigate(`/projects/${project_id}/schema/components/`);
    setDeleteClose(true);
    setTimeout(() => setDeleteClose(false), 0);
  };

  const previewCode = `${source}\nrender(<Component>{__children}</Component>);`;

  if (isNew) return null;
  if (!existing) return null;

  const nameField = (
    <TextField
      key="name"
      size="small"
      className="rtc-name-input"
      label="Component name"
      placeholder="e.g. CalloutBox"
      value={name}
      onChange={e => setName(e.target.value)}
      slotProps={{ inputLabel: { shrink: true } }}
    />
  );

  const deleteButton = (
    <ModalContentBtn
      key="delete-component"
      id="delete-component"
      modalTitle={`Delete "${existing.name}"?`}
      closeModal={deleteClose}
      modalBtn={handleOpen => (
        <Button variant="destructive" onClick={handleOpen}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}
    >
      <Box className="rtc-delete-confirm">
        <Typography variant="body2">
          This will remove the component. Rich text fields using it will fall back to plain rendering.
        </Typography>
        <Box className="rtc-delete-actions">
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </Box>
      </Box>
    </ModalContentBtn>
  );

  return (
    <Box className="rtc-editor-page">
      <AppHeader />

      <PageForm
        formType="document"
        onSubmit={handleSave}
        formTitle={existing.name}
        pageNavigation="Schema / Components"
        extraButtons={[nameField, deleteButton]}
        submitBtnText="Save changes"
      >
        {/* ── Split pane ────────────────────────────────────────────── */}
        <Box className="rtc-split" ref={splitContainerRef}>

          {/* Code row: React component, CSS, sample content — three equal
              columns. Monaco handles Enter/newlines itself — stop the
              keydown here so PageForm's form-level "Enter submits unless
              target is a textarea" handler never intercepts it. */}
          <Box
            className="rtc-code-row"
            style={{ flex: `0 0 ${splitPercent}%` }}
            onKeyDown={event => event.stopPropagation()}
          >
            <Box className="rtc-source-editor">
              <Typography className="rtc-pane-label">React Component</Typography>
              <Box className="rtc-monaco-body">
                <MonacoEditor
                  height="100%"
                  language="javascript"
                  theme="vs-dark"
                  value={source}
                  onChange={v => setSource(v ?? '')}
                  options={MONACO_EDITOR_OPTIONS}
                />
              </Box>
            </Box>

            <Box className="rtc-css-editor">
              <Typography className="rtc-pane-label">CSS</Typography>
              <Box className="rtc-css-editor-body">
                <MonacoEditor
                  height="100%"
                  language="scss"
                  theme="vs-dark"
                  value={css}
                  onChange={v => setCss(v ?? '')}
                  options={MONACO_EDITOR_OPTIONS}
                />
              </Box>
            </Box>

            <Box className="rtc-sample-editor">
              <Typography className="rtc-pane-label">Sample Content (HTML)</Typography>
              <Box className="rtc-sample-editor-body">
                <MonacoEditor
                  height="100%"
                  language="html"
                  theme="vs-dark"
                  value={sampleHtml}
                  onChange={v => setSampleHtml(v ?? '')}
                  options={MONACO_EDITOR_OPTIONS}
                />
              </Box>
            </Box>
          </Box>

          <Box className="rtc-resize-handle" onMouseDown={handleResizeStart} />

          {/* Live preview — full width */}
          <Box className="rtc-preview-pane">
            <Typography className="rtc-pane-label rtc-pane-label--preview">Preview</Typography>
            <Box className="rtc-preview-body">
              {css && <style>{css}</style>}
              <LiveProvider
                code={previewCode}
                scope={{ ...ADVI_WRAPPER_COMPONENTS, __children: sampleChildren }}
                noInline
              >
                <LivePreview />
                <LiveError className="rtc-live-error" />
              </LiveProvider>
            </Box>
          </Box>

        </Box>
      </PageForm>
    </Box>
  );
};
