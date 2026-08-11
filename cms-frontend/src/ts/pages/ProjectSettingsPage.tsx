import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Typography
} from '@mui/material';
import { UserCircle, Info, ClipboardList, AlertTriangle } from 'lucide-react';
import { AsideItem, Button } from 'advi-ui';
import { useProjectData } from '@/hooks/useProject';
import { useWorkspaceData } from '@/hooks/useWorkspace';
import { LinkDrawer } from '@ts/components/LinkDrawer';
import { ProjectAuditLog } from '@ts/components/settings/ProjectAuditLog';
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
  const [confirmDeleteFinal, setConfirmDeleteFinal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [duplicating, setDuplicating] = useState(false);

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

  const closeDeleteFlow = () => {
    setConfirmDelete(false);
    setConfirmDeleteFinal(false);
    setDeleteConfirmText('');
  };

  const handleDelete = () => {
    if (!project_id) return;
    removeProject(project_id).then(success => {
      if (success) navigate('/');
    });
    closeDeleteFlow();
  };

  const navItems: AsideItem[] = [
    { icon: <UserCircle className="h-4 w-4" />, label: 'Identity', onClick: () => navigate(`/projects/${project_id}/settings/identity/`), active: section === 'identity' },
    { icon: <Info className="h-4 w-4" />, label: 'Info', onClick: () => navigate(`/projects/${project_id}/settings/info/`), active: section === 'info' },
    { icon: <ClipboardList className="h-4 w-4" />, label: 'Audit Log', onClick: () => navigate(`/projects/${project_id}/settings/audit-log/`), active: section === 'audit-log' },
    { icon: <AlertTriangle className="h-4 w-4" />, label: 'Danger Zone', onClick: () => navigate(`/projects/${project_id}/settings/danger-zone/`), active: section === 'danger-zone' },
  ];

  if (projectsLoading) return null;
  if (!project) return (
    <Box sx={{ p: 4 }}><Typography color="text.secondary">Project not found.</Typography></Box>
  );

  const renderContent = () => {
    switch (section) {
      case 'info':
        return (
          <Box className="settings-section">
            <Box className="settings-section-header">
              <Typography variant="subtitle1" fontWeight={700}>Project Info</Typography>
              <Typography variant="body2" color="text.secondary">Read-only details about this project</Typography>
            </Box>
            <Box className="settings-section-body">
              <TextField label="Project ID" value={project._id} fullWidth disabled slotProps={{ inputLabel: { shrink: true } }} />
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
              <Box className="settings-section-body" sx={{ flexDirection: 'row !important', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="body2" fontWeight={500}>Duplicate Project</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Creates an independent copy with the same schema, collections, workspaces, and documents.
                  </Typography>
                </Box>
                <Button variant="secondary" className="border-current" onClick={handleDuplicate} disabled={duplicating}>
                  {duplicating ? 'Duplicating…' : 'Duplicate Project'}
                </Button>
              </Box>
            </Box>

            <Box className="settings-section">
              <Box className="settings-section-header">
                <Typography variant="subtitle1" fontWeight={700} color="error">Delete Project</Typography>
                <Typography variant="body2" color="text.secondary">This action cannot be undone</Typography>
              </Box>
              <Box className="settings-section-body" sx={{ flexDirection: 'row !important', alignItems: 'center', justifyContent: 'space-between' }}>
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
                <Button variant="default" className="border-current" onClick={handleSave} disabled={!name.trim() || !dirty}>
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

      {/* First delete confirmation */}
      <Dialog open={confirmDelete} onClose={closeDeleteFlow} fullWidth maxWidth="xs">
        <DialogTitle>Delete project?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            &ldquo;{project.name}&rdquo; and all of its workspaces, schema, collections, and documents will be permanently deleted. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" className="border-current" onClick={closeDeleteFlow}>Cancel</Button>
          <Button variant="destructive" onClick={() => { setConfirmDelete(false); setConfirmDeleteFinal(true); }}>Continue</Button>
        </DialogActions>
      </Dialog>

      {/* Second, typed confirmation */}
      <Dialog open={confirmDeleteFinal} onClose={closeDeleteFlow} fullWidth maxWidth="xs">
        <DialogTitle>Are you absolutely sure?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Type <strong>{project.name}</strong> to confirm you want to permanently delete this project.
          </Typography>
          <TextField
            fullWidth size="small" autoFocus
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            placeholder={project.name}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" className="border-current" onClick={closeDeleteFlow}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirmText !== project.name}>
            Delete Permanently
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
