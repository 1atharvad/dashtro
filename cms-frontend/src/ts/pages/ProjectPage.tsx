import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Chip,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, TextField, Tooltip, Typography
} from '@mui/material';
import { Plus, ArrowRight, Check, X, Pencil, MoreVertical, LayoutTemplate, Database } from 'lucide-react';
import { Button, Menu as AdviMenu } from 'advi-ui';
import { useProjectData } from '@/hooks/useProject';
import { useWorkspaceData } from '@/hooks/useWorkspace';
import { AppHeader } from '@ts/components/AppHeader';
import { WorkspaceSyncModal } from '@ts/components/WorkspaceSyncModal';
import '@/scss/ProjectPage.scss';

export const ProjectPage = () => {
  const navigate = useNavigate();
  const { project_id } = useParams<{ project_id: string }>();

  const { projects, loading: projectsLoading, editProject } = useProjectData();
  const {
    workspaces, loading: wsLoading, error: wsError,
    addWorkspace, removeWorkspace,
  } = useWorkspaceData(project_id ?? '');

  const project = projects.find(p => p._id === project_id);

  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const [addingWs, setAddingWs] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [newWsNameError, setNewWsNameError] = useState('');
  const wsNameInputRef = useRef<HTMLInputElement>(null);

  const validateWsName = (v: string) => {
    if (!v) return '';
    if (v === 'production') return "'production' is reserved.";
    if (!/^[a-z][a-z0-9_-]*$/.test(v)) return 'Lowercase letters, numbers, hyphens, underscores only.';
    return '';
  };

  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [syncModal, setSyncModal] = useState<{ workspaceName: string; mode: 'push' | 'pull' } | null>(null);

  useEffect(() => {
    if (project) {
      setEditName(project.name);
      setEditDesc(project.description);
    }
  }, [project]);


  const handleSaveInfo = () => {
    if (!editName.trim()) return;
    editProject(project_id!, editName.trim(), editDesc.trim());
    setEditingInfo(false);
  };

  const handleAddWorkspace = () => {
    if (!newWsName.trim() || newWsNameError) return;
    addWorkspace(newWsName.trim());
    setNewWsName('');
    setNewWsNameError('');
    setAddingWs(false);
  };

  const nonProdWorkspaces = workspaces.filter(w => !w.is_production);

  if (projectsLoading) return null;
  if (!project) return (
    <Box sx={{ p: 4 }}><Typography color="text.secondary">Project not found.</Typography></Box>
  );

  return (
    <Box className="project-page">

      <AppHeader />

      <Box className="project-page-body">

        {/* ── Page title row ───────────────────────────────────────────── */}
        <Box className="project-page-header">
          <Box>
            <Typography variant="h5" fontWeight={700}>{project.name}</Typography>
            {project.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {project.description}
              </Typography>
            )}
          </Box>
          <Button variant="secondary" className="border-current" onClick={() => navigate(`/projects/${project_id}/schema/`)}>
            <LayoutTemplate className="h-4 w-4" /> Schema
          </Button>
        </Box>

        {/* ── Info cards ──────────────────────────────────────────────── */}
        <Grid container spacing={3} className="project-page-cards">

          <Grid size={{ xs: 12, md: 4 }}>
            <Card className="pp-card pp-card--production" elevation={0}>
              <CardContent className="pp-card-content">
                <Box className="pp-card-header">
                  <Chip label="Production" size="small" color="success" />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 2, flex: 1 }}>
                  The live workspace connected to your website. Push from any workspace to update it.
                </Typography>
                <Button variant="secondary" className="border-current"
                  onClick={() => navigate(`/projects/${project_id}/workspace/production/`)}>
                  View Production <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card className="pp-card" elevation={0}>
              <CardContent className="pp-card-content">
                <Box className="pp-card-header">
                  <Typography variant="overline" color="text.secondary" lineHeight={1}>
                    Realtime Database
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 2, flex: 1 }}>
                  A live JSON data store for this project, synced instantly across every connected client.
                </Typography>
                <Button variant="secondary" className="border-current"
                  onClick={() => navigate(`/projects/${project_id}/rtdb/`)}>
                  <Database className="h-4 w-4" /> Open Realtime Database
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card className="pp-card" elevation={0}>
              <CardContent className="pp-card-content">
                <Box className="pp-card-header">
                  <Typography variant="overline" color="text.secondary" lineHeight={1}>
                    Project Info
                  </Typography>
                  {!editingInfo && (
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => setEditingInfo(true)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>

                {editingInfo ? (
                  <Box sx={{ mt: 1.5 }}>
                    <TextField fullWidth size="small" label="Name" value={editName}
                      onChange={e => setEditName(e.target.value)} sx={{ mb: 1.5 }} autoFocus />
                    <TextField fullWidth size="small" label="Description" value={editDesc}
                      onChange={e => setEditDesc(e.target.value)} multiline rows={2} />
                    <Box sx={{ display: 'flex', gap: 1, mt: 1.5, justifyContent: 'flex-end' }}>
                      <IconButton size="small" onClick={() => {
                        setEditingInfo(false);
                        setEditName(project.name);
                        setEditDesc(project.description);
                      }}>
                        <X className="h-4 w-4" />
                      </IconButton>
                      <IconButton size="small" color="primary" onClick={handleSaveInfo}
                        disabled={!editName.trim()}>
                        <Check className="h-4 w-4" />
                      </IconButton>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="body1" fontWeight={600}>{project.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      {project.description || 'No description.'}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
                      Created {new Date(project.created_at).toLocaleDateString()}
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ── Workspaces ──────────────────────────────────────────────── */}
        <Box className="project-workspaces">
          <Box className="project-workspaces-header">
            <Typography variant="h6" fontWeight={600}>Workspaces</Typography>
            <Button variant="default" className="border-current" onClick={() => setAddingWs(true)}>
              <Plus className="h-4 w-4" /> Add Workspace
            </Button>
          </Box>

          <Dialog
            open={addingWs}
            onClose={() => { setNewWsName(''); setNewWsNameError(''); setAddingWs(false); }}
            fullWidth maxWidth="xs"
            slotProps={{ transition: { onEntered: () => wsNameInputRef.current?.focus() } }}
          >
            <DialogTitle>New Workspace</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth size="small" label="Workspace name"
                inputRef={wsNameInputRef}
                value={newWsName}
                onChange={e => {
                  const v = e.target.value.toLowerCase().replace(/\s/g, '-');
                  setNewWsName(v);
                  setNewWsNameError(validateWsName(v));
                }}
                error={!!newWsNameError}
                helperText={newWsNameError || 'Lowercase letters, numbers, hyphens, underscores.'}
                onKeyDown={e => e.key === 'Enter' && handleAddWorkspace()}
                sx={{ mt: 1 }}
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
              <Button variant="secondary" className="border-current" onClick={() => { setNewWsName(''); setNewWsNameError(''); setAddingWs(false); }}>
                Cancel
              </Button>
              <Button variant="default" className="border-current" onClick={handleAddWorkspace} disabled={!newWsName.trim() || !!newWsNameError}>
                Create
              </Button>
            </DialogActions>
          </Dialog>

          {wsError && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>{wsError}</Typography>
          )}

          {/* Archive confirmation dialog */}
          <Dialog
            open={!!confirmArchive}
            onClose={() => setConfirmArchive(null)}
            fullWidth maxWidth="xs"
          >
            <DialogTitle>Archive workspace?</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                All content in &ldquo;{confirmArchive}&rdquo; will be permanently deleted.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
              <Button variant="secondary" className="border-current" onClick={() => setConfirmArchive(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => {
                if (confirmArchive) removeWorkspace(confirmArchive);
                setConfirmArchive(null);
              }}>Archive</Button>
            </DialogActions>
          </Dialog>

          <WorkspaceSyncModal
            projectId={project_id ?? ''}
            open={!!syncModal}
            workspaceName={syncModal?.workspaceName ?? null}
            mode={syncModal?.mode ?? 'push'}
            onClose={() => setSyncModal(null)}
          />

          {!wsLoading && (
            nonProdWorkspaces.length === 0 ? (
              <Box className="workspace-empty">
                <Typography color="text.secondary" variant="body2">
                  No workspaces yet. Add one to start editing content independently from production.
                </Typography>
              </Box>
            ) : (
              <Box className="workspace-list">
                {nonProdWorkspaces.map(ws => (
                  <Box key={ws.workspace_name} className="workspace-row">
                    <RouterLink
                      to={`/projects/${project_id}/workspace/${ws.workspace_name}/`}
                      className="workspace-row-link"
                    >
                      <Typography variant="body1" fontWeight={600} className="workspace-row-name">
                        {ws.workspace_name}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        Created {new Date(ws.created_at).toLocaleDateString()}
                      </Typography>
                    </RouterLink>
                    <AdviMenu
                      align="end"
                      contentClassName="cms-actions-menu"
                      trigger={
                        <IconButton
                          size="small"
                          className="workspace-row-menu-btn"
                          onClick={e => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </IconButton>
                      }
                      items={[
                        {
                          value: 'push',
                          label: 'Push to production',
                          onSelect: () => setSyncModal({ workspaceName: ws.workspace_name, mode: 'push' }),
                        },
                        {
                          value: 'pull',
                          label: 'Pull latest from production',
                          onSelect: () => setSyncModal({ workspaceName: ws.workspace_name, mode: 'pull' }),
                        },
                        { type: 'separator', value: 'sep' },
                        {
                          value: 'archive',
                          label: 'Archive workspace',
                          destructive: true,
                          onSelect: () => setConfirmArchive(ws.workspace_name),
                        },
                      ]}
                    />
                  </Box>
                ))}
              </Box>
            )
          )}
        </Box>

      </Box>
    </Box>
  );
};
