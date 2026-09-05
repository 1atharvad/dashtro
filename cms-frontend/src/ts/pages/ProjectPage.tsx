import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Card, CardContent, Chip,
  Grid, IconButton, Tooltip, Typography
} from '@mui/material';
import { Plus, ArrowRight, ArrowLeft, Settings, LayoutTemplate, Database } from 'lucide-react';
import { Button } from 'advi-ui';
import { useProjectData } from '@/hooks/useProject';
import { useWorkspaceData } from '@/hooks/useWorkspace';
import { AppHeader } from '@ts/components/AppHeader';
import { WorkspaceRow } from '@ts/components/WorkspaceRow';
import { WorkspaceSyncModal } from '@ts/components/dialogs/WorkspaceSyncModal';
import { CreateWorkspaceDialog } from '@ts/components/dialogs/CreateWorkspaceDialog';
import { ArchiveWorkspaceDialog } from '@ts/components/dialogs/ArchiveWorkspaceDialog';
import '@/scss/ProjectPage.scss';

export const ProjectPage = () => {
  const navigate = useNavigate();
  const { project_id } = useParams<{ project_id: string }>();

  const { projects, loading: projectsLoading } = useProjectData();
  const {
    workspaces, loading: wsLoading, error: wsError,
    addWorkspace, removeWorkspace,
  } = useWorkspaceData(project_id ?? '');

  const project = projects.find(p => p._id === project_id);

  const [addingWs, setAddingWs] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [syncModal, setSyncModal] = useState<{ workspaceName: string; mode: 'push' | 'pull' } | null>(null);

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
          <Box className="project-page-title">
            <Tooltip title="Back to projects">
              <IconButton size="small" onClick={() => navigate('/projects/')}>
                <ArrowLeft className="h-4 w-4" />
              </IconButton>
            </Tooltip>
            <Box>
              <Typography variant="h5" fontWeight={700}>{project.name}</Typography>
              {project.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {project.description}
                </Typography>
              )}
            </Box>
          </Box>
          <Button variant="secondary" onClick={() => navigate(`/projects/${project_id}/schema/`)}>
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
                <Button variant="secondary" 
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
                <Button variant="secondary" 
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
                  <Tooltip title="Project settings">
                    <IconButton size="small" sx={{ p: 1 }} onClick={() => navigate(`/projects/${project_id}/settings/identity/`)}>
                      <Settings className="h-4 w-4" />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Box sx={{ mt: 1.5 }}>
                  <Typography variant="body1" fontWeight={600}>{project.name}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {project.description || 'No description.'}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 2 }}>
                    Created {new Date(project.created_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* ── Workspaces ──────────────────────────────────────────────── */}
        <Box className="project-workspaces">
          <Box className="project-workspaces-header">
            <Typography variant="h6" fontWeight={600}>Workspaces</Typography>
            <Button variant="default" onClick={() => setAddingWs(true)}>
              <Plus className="h-4 w-4" /> Add Workspace
            </Button>
          </Box>

          <CreateWorkspaceDialog
            open={addingWs}
            onClose={() => setAddingWs(false)}
            addWorkspace={addWorkspace}
          />

          {wsError && (
            <Typography color="error" variant="body2" sx={{ mb: 2 }}>{wsError}</Typography>
          )}

          <ArchiveWorkspaceDialog
            workspaceName={confirmArchive}
            onClose={() => setConfirmArchive(null)}
            removeWorkspace={removeWorkspace}
          />

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
                  <WorkspaceRow
                    key={ws.workspace_name}
                    workspace={ws}
                    projectId={project_id ?? ''}
                    onPush={() => setSyncModal({ workspaceName: ws.workspace_name, mode: 'push' })}
                    onPull={() => setSyncModal({ workspaceName: ws.workspace_name, mode: 'pull' })}
                    onArchive={() => setConfirmArchive(ws.workspace_name)}
                  />
                ))}
              </Box>
            )
          )}
        </Box>

      </Box>
    </Box>
  );
};
