import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardActionArea, CardContent,
  Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, TextField, Typography
} from '@mui/material';
import { Plus as AddIcon } from 'lucide-react';
import { Button } from 'advi-ui';
import { useProjectData } from '@/hooks/useProject';
import { AppHeader } from '@ts/components/AppHeader';
import '@/scss/ProjectsList.scss';

export const ProjectsList = () => {
  const navigate = useNavigate();
  const { projects, loading, addProject } = useProjectData();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    if (!name.trim()) return;
    addProject(name.trim(), description.trim());
    setName('');
    setDescription('');
    setCreating(false);
  };

  const handleCancel = () => {
    setName('');
    setDescription('');
    setCreating(false);
  };

  return (
    <Box className="projects-list">
      <AppHeader />

      <Box className="projects-list-body">

        <Box className="projects-list-header">
          <Box>
            <Typography variant="h5" fontWeight={700}>Projects</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              Select a project to manage its content and workspaces.
            </Typography>
          </Box>
          <Button variant="default" onClick={() => setCreating(true)} className="border-current">
            <AddIcon className="h-4 w-4" /> New Project
          </Button>
        </Box>

        <Dialog
          open={creating}
          onClose={handleCancel}
          fullWidth
          maxWidth="xs"
          slotProps={{ transition: { onEntered: () => nameInputRef.current?.focus() } }}
        >
          <DialogTitle>New Project</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
            <TextField
              fullWidth size="small" label="Project name"
              inputRef={nameInputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <TextField
              fullWidth size="small" label="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              multiline rows={2}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button variant="secondary" className="border-current" onClick={handleCancel}>Cancel</Button>
            <Button variant="default" className="border-current" onClick={handleCreate} disabled={!name.trim()}>Create</Button>
          </DialogActions>
        </Dialog>

        {!loading && projects.length === 0 && (
          <Box className="projects-empty">
            <Typography variant="h6" fontWeight={700}>No projects yet</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Click <strong>New Project</strong> above to create your first project.
            </Typography>
          </Box>
        )}

        {!loading && projects.length > 0 && (
          <Grid container spacing={2.5}>
            {projects.map(project => (
              <Grid key={project._id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <Card className="project-card" elevation={0}>
                  <CardActionArea
                    className="project-card-action"
                    onClick={() => navigate(`/projects/${project._id}/`)}
                  >
                    <Box className="project-card-stripe" />
                    <CardContent className="project-card-content">
                      <Box className="project-card-avatar">
                        {project.name[0].toUpperCase()}
                      </Box>
                      <Typography variant="subtitle1" fontWeight={700} className="project-card-name" noWrap sx={{ mt: 1.5 }}>
                        {project.name}
                      </Typography>
                      {project.description ? (
                        <Typography variant="body2" color="text.secondary" className="project-card-desc" sx={{ mt: 0.5 }}>
                          {project.description}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, opacity: 0.45 }}>
                          No description
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 'auto', pt: 1.5 }}>
                        Created {new Date(project.created_at).toLocaleDateString()}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>
    </Box>
  );
};
