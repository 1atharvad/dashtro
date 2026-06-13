import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Avatar, Box, Divider, ListItemIcon, Menu, MenuItem, Typography,
} from '@mui/material';
import { Check, ChevronDown, Folder } from 'lucide-react';
import { useProjectData } from '@/hooks/useProject';
import '@/scss/ProjectSwitcher.scss';

export const ProjectSwitcher = () => {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const project_id = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const { projects } = useProjectData();

  const currentProject = projects.find(p => p._id === project_id);

  const handleSwitch = (id: string) => {
    setAnchor(null);
    if (id !== project_id) navigate(`/projects/${id}/`);
  };

  if (!currentProject) return null;

  return (
    <>
      <Box
        className="project-switcher-btn"
        onClick={e => setAnchor(e.currentTarget)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setAnchor(e.currentTarget as HTMLElement)}
      >
        <Avatar className="project-switcher-avatar">
          {currentProject.name[0].toUpperCase()}
        </Avatar>
        <Box className="project-switcher-label">
          <Typography className="project-switcher-name">{currentProject.name}</Typography>
        </Box>
        <ChevronDown className={`project-switcher-chevron ${anchor ? 'open' : ''} h-4 w-4`} />
      </Box>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        transformOrigin={{ horizontal: 'left', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        slotProps={{
          paper: { className: 'project-switcher-menu' },
        }}
      >
        <Box className="project-switcher-menu-header">
          <Typography className="project-switcher-menu-title">Projects</Typography>
        </Box>
        <Divider />
        {projects.map(p => (
          <MenuItem
            key={p._id}
            onClick={() => handleSwitch(p._id)}
            className={`project-switcher-item ${p._id === project_id ? 'active' : ''}`}
          >
            <ListItemIcon>
              <Avatar className="project-switcher-item-avatar">
                {p.name[0].toUpperCase()}
              </Avatar>
            </ListItemIcon>
            <Box flex={1} minWidth={0}>
              <Typography className="project-switcher-item-name" noWrap>{p.name}</Typography>
              {p.description && (
                <Typography className="project-switcher-item-desc" noWrap>{p.description}</Typography>
              )}
            </Box>
            {p._id === project_id && (
              <Check className="project-switcher-check h-4 w-4" />
            )}
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); navigate('/'); }} className="project-switcher-item">
          <ListItemIcon><Folder className="h-4 w-4" /></ListItemIcon>
          <Typography variant="body2">All projects</Typography>
        </MenuItem>
      </Menu>
    </>
  );
};
