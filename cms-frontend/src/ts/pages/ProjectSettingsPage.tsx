import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, IconButton, InputAdornment, TextField, Tooltip, Typography
} from '@mui/material';
import { UserCircle, Info, ClipboardList, AlertTriangle, Copy } from 'lucide-react';
import { AsideItem, Button, PageNotFound } from 'advi-ui';
import { useProjectData } from '@/hooks/useProject';
import { useWorkspaceData } from '@/hooks/useWorkspace';
import { LinkDrawer } from '@ts/components/LinkDrawer';
import { ProjectAuditLog } from '@ts/components/settings/ProjectAuditLog';
import { DeleteProjectDialog } from '@ts/components/dialogs/DeleteProjectDialog';
import '@/scss/Settings.scss';
import '@/scss/ProjectPage.scss';

const formatDate = (iso?: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

export const ProjectSettingsPage = () => {
  const navigate = useNavigate();
  const { project_id, section } = useParams<{ project_id: string; section: string }>();

  const { projects, loading: projectsLoading, editProject, removeProject, duplicateProjectData } = useProjectData();
  const { workspaces } = useWorkspaceData(project_id ?? '');
  const project = projects.find(p => p._id === project_id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const copyProjectId = () => {
    if (!project_id) return;
    navigator.clipboard.writeText(project_id);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 1500);
  };

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description);
    }
  }, [project]);

  const dirty = project && (name.trim() !== project.name || description.trim() !== (project.description || ''));

  const handleSave = () => {
    if (!project_id || !name.trim()) return;
    editProject(project_id, name.trim(), description.trim());
  };

  const handleDuplicate = async () => {
    if (!project_id) return;
    setDuplicating(true);
    const created = await duplicateProjectData(project_id);
    setDuplicating(false);
    if (created) navigate(`/projects/${created._id}/`);
  };

  const navItems: AsideItem[] = [
    { icon: <UserCircle className="h-4 w-4" />, label: 'Identity', onClick: () => navigate(`/projects/${project_id}/settings/identity/`), active: section === 'identity' },
    { icon: <Info className="h-4 w-4" />, label: 'Info', onClick: () => navigate(`/projects/${project_id}/settings/info/`), active: section === 'info' },
    { icon: <ClipboardList className="h-4 w-4" />, label: 'Audit Log', onClick: () => navigate(`/projects/${project_id}/settings/audit-log/`), active: section === 'audit-log' },
    { icon: <AlertTriangle className="h-4 w-4" />, label: 'Danger Zone', onClick: () => navigate(`/projects/${project_id}/settings/danger-zone/`), active: section === 'danger-zone' },
  ];

  if (projectsLoading) return null;
  if (!project) return <PageNotFound />;

  const renderContent = () => {
    switch (section) {
      case 'info':
        return (
          <Box className="settings-section">
            <Box className="settings-section-header">
              <Typography variant="subtitle1" fontWeight={700}>Project Info</Typography>
              <Typography variant="body2" color="text.secondary">Identifiers and metadata for this project</Typography>
            </Box>
            <Box className="settings-section-body">
              <TextField
                label="Project ID"
                value={project._id}
                fullWidth
                disabled
                slotProps={{
                  inputLabel: { shrink: true },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={idCopied ? 'Copied!' : 'Copy project ID'}>
                          <IconButton size="small" onClick={copyProjectId}>
                            <Copy className="h-3.5 w-3.5" />
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField label="Created" value={formatDate(project.created_at)} fullWidth disabled slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Last updated" value={formatDate(project.updated_at)} fullWidth disabled slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Workspaces" value={workspaces.length} fullWidth disabled slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
          </Box>
        );

      case 'audit-log':
        return <ProjectAuditLog projectId={project._id} />;

      case 'danger-zone':
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box className="settings-section">
              <Box className="settings-section-header">
                <Typography variant="subtitle1" fontWeight={700}>Backup</Typography>
                <Typography variant="body2" color="text.secondary">Create a full copy of this project</Typography>
              </Box>
              <Box className="settings-section-body settings-body-row">
                <Box>
                  <Typography variant="body2" fontWeight={500}>Duplicate Project</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Creates an independent copy with the same schema, collections, workspaces, and documents.
                  </Typography>
                </Box>
                <Button variant="secondary" onClick={handleDuplicate} disabled={duplicating}>
                  {duplicating ? 'Duplicating…' : 'Duplicate Project'}
                </Button>
              </Box>
            </Box>

            <Box className="settings-section">
              <Box className="settings-section-header">
                <Typography variant="subtitle1" fontWeight={700} color="error">Delete Project</Typography>
                <Typography variant="body2" color="text.secondary">This action cannot be undone</Typography>
              </Box>
              <Box className="settings-section-body settings-body-row">
                <Box>
                  <Typography variant="body2" fontWeight={500}>Delete Project</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Permanently deletes this project, its workspaces, schema, collections, and documents.
                  </Typography>
                </Box>
                <Button variant="destructive" onClick={() => setConfirmDelete(true)}>Delete Project</Button>
              </Box>
            </Box>
          </Box>
        );

      case 'identity':
      default:
        return (
          <Box className="settings-section">
            <Box className="settings-section-header">
              <Typography variant="subtitle1" fontWeight={700}>Identity</Typography>
              <Typography variant="body2" color="text.secondary">Name and description shown throughout the CMS</Typography>
            </Box>
            <Box className="settings-section-body">
              <TextField label="Name" value={name} onChange={e => setName(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="Description" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={3} slotProps={{ inputLabel: { shrink: true } }} />
              <Box className="settings-actions">
                <Button variant="default" onClick={handleSave} disabled={!name.trim() || !dirty}>
                  Save Changes
                </Button>
              </Box>
            </Box>
          </Box>
        );
    }
  };

  return (
    <Box className="project-settings">
      <LinkDrawer className="settings-drawer" items={navItems} />
      <Box className="project-settings-content">
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" fontWeight={700}>Project Settings</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{project.name}</Typography>
        </Box>
        {renderContent()}
      </Box>

      <DeleteProjectDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        projectName={project.name}
        removeProject={() => removeProject(project_id ?? '')}
        onDeleted={() => navigate('/projects/')}
      />
    </Box>
  );
};
