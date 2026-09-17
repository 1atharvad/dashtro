import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, TextField, Typography, Dialog, DialogTitle, DialogContent,
  Divider, IconButton, Menu, MenuItem, ListItemIcon, Tooltip,
  useMediaQuery,
} from '@mui/material';
import { Trash2, X, MoreVertical, Save as SaveIcon, Pencil } from 'lucide-react';
import { Button, Tabs, toast } from 'advi-ui';
import { LiveProvider, LivePreview, LiveError } from 'react-live';
import {
  useRichTextComponentsQuery, useUpdateRichTextComponentMutation, useDeleteRichTextComponentMutation,
} from '@ts/api/richTextComponents';
import { ADVI_WRAPPER_COMPONENTS } from '@ts/utils/adviWrapperComponents';
import { componentScopeClass, scopeCss } from '@ts/utils/richTextScoping';
import { DEFAULT_SAMPLE_HTML } from '@ts/utils/richTextComponentDefaults';
import { AppHeader } from '@ts/components/AppHeader';
import { PageForm } from '@ts/components/PageForm';
import { MonacoEditorPane } from '@ts/components/MonacoEditorPane';
import { useResizableSplit } from '@/hooks/useResizableSplit';
import '@/scss/DocCollection.scss';
import '@/scss/RichTextComponents.scss';

const RtcActionsMenu = ({ onSave, onEditName, onDelete }: { onSave: () => void; onEditName: () => void; onDelete: () => void }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const close = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title="Actions">
        <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)}>
          <MoreVertical className="h-4 w-4" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={close}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        slotProps={{ paper: { sx: { width: 200, mt: 0.5, borderRadius: 1.5 } } }}
      >
        <MenuItem onClick={() => { close(); onEditName(); }} sx={{ fontSize: 13 }}>
          <ListItemIcon><Pencil className="h-4 w-4" /></ListItemIcon>
          Edit name
        </MenuItem>
        <MenuItem onClick={() => { close(); onSave(); }} sx={{ fontSize: 13 }}>
          <ListItemIcon><SaveIcon className="h-4 w-4" /></ListItemIcon>
          Save changes
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { close(); onDelete(); }} sx={{ color: 'error.main', fontSize: 13 }}>
          <ListItemIcon sx={{ color: 'error.main' }}><Trash2 className="h-4 w-4" /></ListItemIcon>
          Delete
        </MenuItem>
      </Menu>
    </>
  );
};

const SPLIT_STORAGE_KEY = 'rtcEditorSplit';
const DEFAULT_SPLIT_PERCENT = 60;
const MIN_SPLIT_PERCENT = 20;
const MAX_SPLIT_PERCENT = 80;

export const RichTextComponentEditor = () => {
  const { project_id, component_id } = useParams<{ project_id: string; component_id: string }>();
  const isNew = component_id === 'new';
  const navigate = useNavigate();
  // This page's own breakpoint is 1023px, not the site-wide 767px — three
  // code columns don't fit a tablet either, so tablets get the tab layout
  // too. Must stay in sync with RichTextComponents.scss's matching value.
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [activeEditorTab, setActiveEditorTab] = useState('source');
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [sampleHtml, setSampleHtml] = useState(DEFAULT_SAMPLE_HTML);
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>('light');

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

  const handleSave = (event?: FormEvent) => {
    event?.preventDefault();
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
    setDeleteOpen(false);
  };

  const previewCode = `${source}\nrender(<Component>{__children}</Component>);`;

  if (isNew) return null;
  if (!existing) return null;

  const nameField = (
    <span key="name" className="hidden md:inline-flex">
      <TextField
        size="small"
        className="rtc-name-input"
        label="Component name"
        placeholder="e.g. CalloutBox"
        value={name}
        onChange={e => setName(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </span>
  );

  const desktopDeleteButton = (
    <span key="delete-component" className="hidden md:inline-flex">
      <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
        <Trash2 className="h-4 w-4" /> Delete
      </Button>
    </span>
  );

  const mobileActionsButton = (
    <span key="actions-mobile" className="md:hidden">
      <RtcActionsMenu
        onSave={() => handleSave()}
        onEditName={() => setNameModalOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />
    </span>
  );

  return (
    <Box className="rtc-editor-page">
      <AppHeader />

      <PageForm
        formType="document"
        onSubmit={handleSave}
        formTitle={existing.name}
        pageNavigation="Schema / Components"
        extraButtons={[nameField, desktopDeleteButton, mobileActionsButton]}
        submitBtnText="Save changes"
        hideSubmitOnMobile
      >
        {/* ── Split pane ────────────────────────────────────────────── */}
        <Box className="rtc-split" ref={splitContainerRef}>

          {/* Code row: React component, CSS, sample content. Side by side as
              three equal columns on desktop; below that, a phone screen has
              no room for three columns (or for Monaco's own horizontal
              scrolling to coexist with a swipe gesture), so they switch to a
              tab-per-editor layout instead — one full-width/height editor
              at a time. Both branches carry the same draggable
              flex-basis (`splitPercent`) so the handle below still resizes
              them against the preview pane on both desktop and mobile.
              advi-ui's Tabs doesn't forward a `style`/`onKeyDown` prop, so
              the mobile branch needs its own sized wrapper — unlike the
              desktop branch, where flex-basis must land directly on
              .rtc-code-row itself (a wrapping div in between would silently
              no-op it, since flex-basis only does anything on a direct flex
              child of the flex-column .rtc-split container). Monaco handles
              Enter/newlines itself — stop the keydown here so PageForm's
              form-level "Enter submits unless target is a textarea" handler
              never intercepts it. */}
          {isMobile ? (
              <Box
                className="rtc-code-tabs-wrapper"
                style={{ flex: `0 0 ${splitPercent}%` }}
                onKeyDown={event => event.stopPropagation()}
              >
              <Tabs
                className="rtc-code-tabs"
                value={activeEditorTab}
                onChange={setActiveEditorTab}
                tabs={[
                  {
                    value: 'source',
                    label: 'React Component',
                    // advi-ui's Tabs always mounts every tab's `content` (it
                    // only toggles the native `hidden` attribute), so all
                    // three Monaco instances would otherwise load at once —
                    // gate each on the active tab ourselves.
                    content: activeEditorTab === 'source' ? (
                      <MonacoEditorPane
                        label="React Component"
                        language="javascript"
                        value={source}
                        onChange={setSource}
                        className="rtc-source-editor"
                        bodyClassName="rtc-monaco-body"
                      />
                    ) : null,
                  },
                  {
                    value: 'css',
                    label: 'CSS',
                    content: activeEditorTab === 'css' ? (
                      <MonacoEditorPane
                        label="CSS"
                        language="scss"
                        value={css}
                        onChange={setCss}
                        className="rtc-css-editor"
                        bodyClassName="rtc-css-editor-body"
                      />
                    ) : null,
                  },
                  {
                    value: 'sample',
                    label: 'Sample Content',
                    content: activeEditorTab === 'sample' ? (
                      <MonacoEditorPane
                        label="Sample Content (HTML)"
                        language="html"
                        value={sampleHtml}
                        onChange={setSampleHtml}
                        className="rtc-sample-editor"
                        bodyClassName="rtc-sample-editor-body"
                      />
                    ) : null,
                  },
                ]}
              />
              </Box>
            ) : (
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
            )}

          <Box className="rtc-resize-handle" onMouseDown={handleResizeStart} onTouchStart={handleResizeStart} />

          {/* Live preview — full width */}
          <Box className="rtc-preview-pane">
            <Box className="rtc-preview-header">
              <Typography className="rtc-pane-label rtc-pane-label--preview">Preview</Typography>
              <TextField
                select
                size="small"
                className="rtc-preview-mode-select"
                value={previewMode}
                onChange={e => setPreviewMode(e.target.value as 'light' | 'dark')}
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
              </TextField>
            </Box>
            <Box className={`rtc-preview-body${previewMode === 'dark' ? ' rtc-preview-body--dark' : ''} ${componentScopeClass(name || existing.name)}`}>
              {css && <style>{scopeCss(css, name || existing.name)}</style>}
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

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          {`Delete "${existing.name}"?`}
          <IconButton size="small" onClick={() => setDeleteOpen(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
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
        </DialogContent>
      </Dialog>

      <Dialog open={nameModalOpen} onClose={() => setNameModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          Edit component name
          <IconButton size="small" onClick={() => setNameModalOpen(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField
            fullWidth
            autoFocus
            label="Component name"
            placeholder="e.g. CalloutBox"
            value={name}
            onChange={e => setName(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="default"
              disabled={!name.trim()}
              onClick={() => { handleSave(); setNameModalOpen(false); }}
            >
              <SaveIcon className="h-4 w-4" /> Save
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};
