import { useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box } from '@mui/material';
import { UserCircle, Lock, Users, Code2, Puzzle, ClipboardList } from 'lucide-react';
import { AsideItem, AsideText, Switch } from 'advi-ui';
import { LinkDrawer } from '@ts/components/LinkDrawer';
import { useColorMode } from '@ts/theme/ThemeProvider';
import { SettingsProfile } from '@ts/components/settings/SettingsProfile';
import { SettingsSecurity } from '@ts/components/settings/SettingsSecurity';
import { SettingsUsers } from '@ts/components/settings/SettingsUsers';
import { SettingsAPI } from '@ts/components/settings/SettingsAPI';
import { SettingsIntegrations } from '@ts/components/settings/SettingsIntegrations';
import { SettingsAuditLog } from '@ts/components/settings/SettingsAuditLog';

import '@/scss/DocCollection.scss';
import '@/scss/Settings.scss';

export const SettingsPage = () => {
  const navigate = useNavigate();
  const { setting_type } = useParams();
  const drawerRef = useRef<{ handleDrawerToggle: () => void }>(null);
  const { mode, toggleColorMode } = useColorMode();
  const checked = mode === 'dark';

  const navItems: AsideItem[] = [
    { icon: <UserCircle className="h-4 w-4" />,    label: 'Profile',      onClick: () => navigate('/settings/profile/'),      active: setting_type === 'profile' },
    { icon: <Lock className="h-4 w-4" />,          label: 'Security',     onClick: () => navigate('/settings/security/'),     active: setting_type === 'security' },
    { icon: <Users className="h-4 w-4" />,         label: 'Users',        onClick: () => navigate('/settings/users/'),        active: setting_type === 'users' },
    { icon: <Code2 className="h-4 w-4" />,         label: 'API',          onClick: () => navigate('/settings/api/'),          active: setting_type === 'api' },
    { icon: <Puzzle className="h-4 w-4" />,        label: 'Integrations', onClick: () => navigate('/settings/integrations/'), active: setting_type === 'integrations' },
    { icon: <ClipboardList className="h-4 w-4" />, label: 'Audit Log',    onClick: () => navigate('/settings/audit-log/'),    active: setting_type === 'audit-log' },
  ];

  const renderContent = () => {
    switch (setting_type) {
      case 'profile':      return <SettingsProfile />;
      case 'security':     return <SettingsSecurity />;
      case 'users':        return <SettingsUsers />;
      case 'api':          return <SettingsAPI />;
      case 'integrations': return <SettingsIntegrations />;
      case 'audit-log':    return <SettingsAuditLog />;
      default:             return <SettingsProfile />;
    }
  };

  return (
    <Box className="settings">
      <LinkDrawer
        className="settings-drawer"
        items={navItems}
        ref={drawerRef}

        footer={(isOpen) => isOpen ? (
          <AsideText
            label="Dark Mode"
            icon={<Switch
              labelPosition="right"
              checked={checked}
              onChange={toggleColorMode}
            />}
          />
        ) : null}
      />
      <Box className="settings-content">
        {renderContent()}
      </Box>
    </Box>
  );
};
