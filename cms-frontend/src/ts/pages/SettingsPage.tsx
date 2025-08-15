import { ChangeEvent, useRef, useState } from 'react';
import { useParams, Link as BrowserLink } from "react-router-dom";
import { Box, Button, Divider, Paper, Switch, Typography, useTheme } from '@mui/material';
import {
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  Extension as ExtensionIcon,
  Api as ApiIcon,
  Group as GroupIcon,
  AccountCircle as AccountIcon
} from '@mui/icons-material';
import { LinkDrawer } from '@ts/components/LinkDrawer';

import '@/scss/DocCollection.scss';
import { PageTabs } from '@ts/components/PageTabs';
import { SettingsProfile } from '@ts/components/SettingsProfile';
import { useColorMode } from '@ts/theme/ThemeProvider';

const ProfilePage = () => {
  return (
    <Box className='settings-content'>
      <Paper elevation={3} sx={{ p: 3, m: 3 }}>
        <Typography variant="h4" component="h2" fontWeight="bold" color="text.primary">
          My Profile
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          Manage your account settings and preferences
        </Typography>
        <PageTabs tab={[
          {
            tabName: 'Profile',
            tabContent: (
              <SettingsProfile/>
            )
          },
          {
            tabName: 'Security',
            tabContent: (
              <></>
            )
          }
        ]}/>
      </Paper>
    </Box>
  );
}

export const SettingsPage = () => {
  const theme = useTheme();
  const {setting_type} = useParams();
  const [checked, setChecked] = useState(localStorage.getItem('theme') === 'dark');
  const drawerRef = useRef<{ handleDrawerToggle: () => void }>(null);
  const { toggleColorMode } = useColorMode();

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    setChecked(event.target.checked);
    toggleColorMode();
  }

  const settingLinkDetails = [
    {
      url: 'profile/',
      icon: <AccountIcon/>,
      name: 'My Profile',
      isModeSwitch: false
    },
    {
      url: 'users/',
      icon: <GroupIcon/>,
      name: 'Users',
      isModeSwitch: false
    },
    {
      url: 'api/',
      icon: <ApiIcon/>,
      name: 'API',
      isModeSwitch: false
    },
    {
      url: 'integrations/',
      icon: <ExtensionIcon/>,
      name: 'Integrations',
      isModeSwitch: false
    },
    {
      url: '',
      icon: null,
      name: 'Dark Mode',
      isModeSwitch: true
    },
  ]

  return (
    <Box className='settings'>
      <LinkDrawer className='settings-drawer' LinkList={() => (
        <Box className='settings-list'>
          <Divider/>
          {settingLinkDetails.map((linkDetail, index) =>
            !linkDetail.isModeSwitch ? (
              <Button
                  key={`settings-link-${index}`}
                  component={BrowserLink}
                  to={`/settings/${linkDetail.url}`}
                  className='settings-list-title-link'
                  startIcon={linkDetail.icon}>
                <Typography className='settings-list-title'
                    component="h2"
                    sx={{color: theme.palette.asideTextColor}}>
                  {linkDetail.name}
                </Typography>
              </Button>
            ) : (
              <Box className='settings-list-title-link' key={`settings-link-${index}`}>
                {checked ? (
                  <DarkModeIcon className='settings-list-title-logo'/>
                ) : (
                  <LightModeIcon className='settings-list-title-logo'/>
                )}
                <Box className='settings-list-title-text'>
                  <Typography className='settings-list-title'
                      component="h2"
                      sx={{color: theme.palette.asideTextColor}}>
                    {linkDetail.name}
                  </Typography>
                  <Switch color="secondary" checked={checked} onChange={handleChange}/>
                </Box>
              </Box>
            )
          )}
        </Box>
      )} ref={drawerRef}/>
      {setting_type === 'profile' && <ProfilePage/>}
    </Box>
  )
}