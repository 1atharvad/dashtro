import { useMemo, useRef, useState } from 'react';
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
import { getRecentProjectIds } from '@ts/utils/recentProjects';
import type { Project } from '@ts/api/projects';
import '@/scss/ProjectsList.scss';

const ProjectCard = ({ project, onClick }: { project: Project; onClick: () => void }) => (
  <Card className="project-card" elevation={0}>
    <CardActionArea className="project-card-action" onClick={onClick}>
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
);

export const ProjectsList = () => {
  const navigate = useNavigate();
  const { projects, loading, addProject } = useProjectData();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const recentProjects = useMemo(() => {
    const byId = new Map(projects.map(p => [p._id, p]));
    return getRecentProjectIds()
      .map(id => byId.get(id))
      .filter((p): p is Project => !!p)
      .slice(0, 3);
  }, [projects]);

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
          <Button variant="default" onClick={() => setCreating(true)}>
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
          <DialogContent className="dialog-content-tight" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
            <Button variant="default" onClick={handleCreate} disabled={!name.trim()}>Create</Button>
          </DialogActions>
        </Dialog>

        <Box className="projects-list-scroll">
          {!loading && projects.length === 0 && (
            <Box className="projects-empty">
              <Typography variant="h6" fontWeight={700}>No projects yet</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                Click <strong>New Project</strong> above to create your first project.
              </Typography>
            </Box>
          )}

          {!loading && projects.length > 0 && (
            <>
              <Box className="hidden md:block">
                {recentProjects.length > 0 && (
                  <Box sx={{ mb: 3.5 }}>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 }}>
                      Recently used
                    </Typography>
                    <Grid container spacing={2.5}>
                      {recentProjects.map(project => (
                        <Grid key={project._id} size={4}>
                          <ProjectCard project={project} onClick={() => navigate(`/projects/${project._id}/`)} />
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                )}

                {recentProjects.length > 0 && (
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 12 }}>
                    All projects
                  </Typography>
                )}
              </Box>

              <Box className="project-list">
                {projects.map(project => (
                  <Box
                    key={project._id}
                    className="project-list-row"
                    onClick={() => navigate(`/projects/${project._id}/`)}
                  >
                    <Box className="project-card-avatar project-list-row-avatar">
                      {project.name[0].toUpperCase()}
                    </Box>
                    <Box className="project-list-row-text">
                      <Typography variant="subtitle2" fontWeight={700} noWrap>
                        {project.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ opacity: project.description ? 1 : 0.45 }}>
                        {project.description || 'No description'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};
