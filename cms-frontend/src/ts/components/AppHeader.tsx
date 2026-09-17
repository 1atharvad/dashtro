import { ReactNode, useEffect } from 'react';
import { Avatar, Box, IconButton, Tooltip } from '@mui/material';
import { LogoLink } from 'advi-ui';
import { useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@ts/context/userContextValue';
import dashtroLogo from '@/assets/images/favicon-96x96.png';

interface AppHeaderProps {
  actions?: ReactNode;
  /** Overrides the logo's link target (defaults to this project's page, or the projects list outside a project). */
  logoUrl?: string;
}

export const AppHeader = ({ actions, logoUrl }: AppHeaderProps) => {
  const navigate = useNavigate();
  const { user, refreshUser } = useUser();
  const { project_id } = useParams<{ project_id?: string }>();
  const resolvedLogoUrl = logoUrl ?? (project_id ? `/projects/${project_id}/` : '/projects/');

  useEffect(() => {
    if (!user) {
      refreshUser();
    }
  }, [user, refreshUser]);
  return (
    <Box component="header" className="vi-header">
      <Box className="vi-header-desktop">
        <LogoLink
          name="DashTro!"
          image={{ url: dashtroLogo, alt: 'DashTro Logo' }}
          link={{ url: resolvedLogoUrl, isExternal: false }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
          {actions}
          <Tooltip title="Profile">
            <IconButton onClick={() => navigate('/settings/profile/')} sx={{ p: 0.5 }} aria-label="Profile">
              <Avatar
                src={user?.avatarUrl}
                sx={{ width: 32, height: 32, fontSize: '0.8rem', bgcolor: 'var(--cms-gold)', color: 'var(--cms-chrome)' }}
              >
                {user?.initials}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};
