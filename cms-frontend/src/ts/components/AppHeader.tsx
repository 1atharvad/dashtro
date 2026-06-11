import { ReactNode } from 'react';
import { Avatar, Box, IconButton, Tooltip } from '@mui/material';
import { LogoLink } from 'advi-ui';
import { useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@ts/context/UserContext';
import dashtroLogo from '@/assets/images/favicon-96x96.png';

interface AppHeaderProps {
  actions?: ReactNode;
}

export const AppHeader = ({ actions }: AppHeaderProps) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { project_id } = useParams<{ project_id?: string }>();
  const logoUrl = project_id ? `/projects/${project_id}/` : '/';
  return (
    <Box component="header" className="vi-header">
      <Box className="vi-header-desktop">
        <LogoLink
          name="DashTro!"
          image={{ url: dashtroLogo, alt: 'DashTro Logo' }}
          link={{ url: logoUrl, isExternal: false }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, marginLeft: 'auto' }}>
          {actions}
          <Tooltip title="Profile">
            <IconButton onClick={() => navigate('/settings/profile/')} sx={{ p: 0.5 }}>
              <Avatar src={user?.avatarUrl} sx={{ width: 32, height: 32, fontSize: '0.8rem' }}>
                {user?.initials}
              </Avatar>
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};
