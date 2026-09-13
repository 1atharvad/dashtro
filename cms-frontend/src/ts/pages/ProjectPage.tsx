import { ReactNode, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { Plus, LayoutTemplate, MoreVertical } from 'lucide-react';
import { Button, PageNotFound } from 'advi-ui';
import { useProjectData } from '@/hooks/useProject';
import { useWorkspaceData } from '@/hooks/useWorkspace';
import { AppHeader } from '@ts/components/AppHeader';
import { ProjectOverviewCards } from '@ts/components/ProjectOverviewCards';
import { WorkspaceRow } from '@ts/components/WorkspaceRow';
import { WorkspaceSyncModal } from '@ts/components/dialogs/WorkspaceSyncModal';
import { CreateWorkspaceDialog } from '@ts/components/dialogs/CreateWorkspaceDialog';
import { ArchiveWorkspaceDialog } from '@ts/components/dialogs/ArchiveWorkspaceDialog';
import { recordProjectVisit } from '@ts/utils/recentProjects';
import '@/scss/ProjectPage.scss';

const SingleActionMenu = ({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) => {
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
        <MenuItem onClick={() => { close(); onClick(); }} sx={{ fontSize: 13 }}>
          <ListItemIcon>{icon}</ListItemIcon>
          {label}
        </MenuItem>
      </Menu>
    </>
  );
};

export const ProjectPage = () => {
  const navigate = useNavigate();
  const { project_id } = useParams<{ project_id: string }>();

  const { projects, loading: projectsLoading } = useProjectData();
  const {
    workspaces, loading: wsLoading, error: wsError,
    addWorkspace, removeWorkspace,
  } = useWorkspaceData(project_id ?? '');

  const project = projects.find(p => p._id === project_id);

  useEffect(() => {
    if (project_id && project) recordProjectVisit(project_id);
  }, [project_id, project]);

  const [addingWs, setAddingWs] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [syncModal, setSyncModal] = useState<{ workspaceName: string; mode: 'push' | 'pull' } | null>(null);

  const nonProdWorkspaces = workspaces.filter(w => !w.is_production);

  if (projectsLoading) return null;
  if (!project) return <PageNotFound />;

  return (
    <Box className="project-page">

      <AppHeader logoUrl="/projects/" />

      <Box className="project-page-body">

        {/* ── Page title row ───────────────────────────────────────────── */}
        <Box className="project-page-header">
          <Box className="project-page-title">
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
        <ProjectOverviewCards projectId={project_id ?? ''} project={project} />

        {/* ── Workspaces ──────────────────────────────────────────────── */}
        <Box className="project-workspaces">
          <Box className="project-workspaces-header">
            <Typography variant="h6" fontWeight={600}>Workspaces</Typography>
            <span className="hidden md:inline-flex">
              <Button variant="default" onClick={() => setAddingWs(true)}>
                <Plus className="h-4 w-4" /> Add Workspace
              </Button>
            </span>
            <span className="md:hidden">
              <SingleActionMenu
                icon={<Plus className="h-4 w-4" />}
                label="Add Workspace"
                onClick={() => setAddingWs(true)}
              />
            </span>
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
