import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, TextField, Typography } from '@mui/material';
import { Trash2 } from 'lucide-react';
import { Button, toast } from 'advi-ui';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import {
  useRichTextComponentsQuery, useUpdateRichTextComponentMutation, useDeleteRichTextComponentMutation,
} from '@ts/api/richTextComponents';
import { ADVI_WRAPPER_COMPONENTS } from '@ts/utils/adviWrapperComponents';
import { DEFAULT_SAMPLE_HTML } from '@ts/utils/richTextComponentDefaults';
import { AppHeader } from '@ts/components/AppHeader';
import { PageForm } from '@ts/components/PageForm';
import { ModalContentBtn } from '@ts/components/dialogs/ModalContentBtn';
import { MonacoEditorPane } from '@ts/components/MonacoEditorPane';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import '@/scss/DocCollection.scss';
import '@/scss/RichTextComponents.scss';

const SPLIT_STORAGE_KEY = 'rtcEditorSplit';
const DEFAULT_SPLIT_PERCENT = 60;
const MIN_SPLIT_PERCENT = 20;
const MAX_SPLIT_PERCENT = 80;

export const RichTextComponentEditor = () => {
  const { project_id, component_id } = useParams<{ project_id: string; component_id: string }>();
  const isNew = component_id === 'new';
  const navigate = useNavigate();
  const { data: components = [] } = useRichTextComponentsQuery(project_id ?? '');
  const updateMutation = useUpdateRichTextComponentMutation(project_id ?? '');
  const deleteMutation = useDeleteRichTextComponentMutation(project_id ?? '');

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
  const { splitPercent, containerRef: splitContainerRef, handleResizeStart } = useResizableSplit({
    storageKey: SPLIT_STORAGE_KEY,
    defaultPercent: DEFAULT_SPLIT_PERCENT,
    minPercent: MIN_SPLIT_PERCENT,
    maxPercent: MAX_SPLIT_PERCENT,
  });

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
    updateMutation.mutateAsync({ componentId: existing.id, name, source, css, sampleHtml })
      .then(() => toast.success('Component saved.'))
      .catch((err: Error) => toast.error(err.message));
  };

  const handleDelete = () => {
    if (!project_id || !existing) return;
    deleteMutation.mutateAsync(existing.id).catch(err => {
      console.error(err);
      toast.error('Failed to delete component');
    });
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
            <MonacoEditorPane
              label="React Component"
              language="javascript"
              value={source}
              onChange={setSource}
              className="rtc-source-editor"
              bodyClassName="rtc-monaco-body"
            />

            <MonacoEditorPane
              label="CSS"
              language="scss"
              value={css}
              onChange={setCss}
              className="rtc-css-editor"
              bodyClassName="rtc-css-editor-body"
            />

            <MonacoEditorPane
              label="Sample Content (HTML)"
              language="html"
              value={sampleHtml}
              onChange={setSampleHtml}
              className="rtc-sample-editor"
              bodyClassName="rtc-sample-editor-body"
            />
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
