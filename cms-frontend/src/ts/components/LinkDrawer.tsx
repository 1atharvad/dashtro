import { forwardRef, useImperativeHandle, useState } from 'react';
import { Link as BrowserLink } from "react-router-dom";
import { Link } from '@ts/components/Link';
import { Box, Button, Drawer, Typography, useTheme } from '@mui/material';
import { SettingsOutlined as SettingsIcon } from '@mui/icons-material';
import dashtroLogo from '@/assets/images/favicon-96x96.png';
import { RootState } from '@/redux/store';
import { useSelector } from "react-redux";

const header = {
  logo: {
    name: 'DashTro!',
    link: {
      text: '',
      url: '/',
      is_external_link: false
    },
    image: {
      url: dashtroLogo,
      alt_text: 'Dashtro Logo'
    }
  }
};

const HeaderLogo = ({logo}: {logo: {[key: string]: any}}) => {
  const theme = useTheme();

  return (
    <Box className="header-logo">
      <Link
          link={logo.link}
          className='header-logo-link'>
        <Box className="header-logo-container">
          <img className="logo-image" src={logo.image.url} alt={logo.image.alt_text}/>
          <Typography className="logo-name"
              component="span"
              sx={{color: theme.palette.appTextColor}}>
            {logo.name}
          </Typography>
        </Box>
      </Link>
    </Box>
  );
}

export const LinkDrawer = forwardRef(({className, LinkList}: {className: string, LinkList: () => JSX.Element}, ref) => {
  const theme = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const handleDrawerClose = () => {
    setIsClosing(true);
    setMobileOpen(false);
  };

  const handleDrawerTransitionEnd = () => {
    setIsClosing(false);
  };

  useImperativeHandle(ref, () => ({
    handleDrawerToggle() {
      if (!isClosing) {
        setMobileOpen(!mobileOpen);
      }
    }
  }), [isClosing]);

  return (
    <Box component="nav"
        className={className}
        aria-label="mailbox folders">
      <Drawer
          variant="temporary"
          open={mobileOpen}
          onTransitionEnd={handleDrawerTransitionEnd}
          onClose={handleDrawerClose}
          ModalProps={{
            keepMounted: true,
          }}
          className={`${className}-moving`}
          slotProps={{
            paper: {
              sx: {
                backgroundColor: theme.palette.asideBkColor,
              },
            },
          }}>
        <HeaderLogo logo={header.logo} />
        <LinkList/>
        <Button
            component={BrowserLink}
            to={`/settings/profile/`}
            className='settings-link'
            startIcon={<SettingsIcon />}>
          <Typography className='settings-link-title'
              component="h2"
              sx={{color: theme.palette.asideTextColor}}>
            Settings
          </Typography>
        </Button>
      </Drawer>
      <Drawer
          variant="permanent"
          className={`${className}-fixed`}
          slotProps={{
            paper: {
              sx: {
                background: theme.palette.asideBkColor,
              },
            },
          }}
          open>
        <HeaderLogo logo={header.logo} />
        <LinkList/>
        <Button
            component={BrowserLink}
            to={`/settings/profile/`}
            className='settings-link'
            startIcon={<SettingsIcon />}>
          <Typography className='settings-link-title'
              component="h2"
              sx={{color: theme.palette.asideTextColor}}>
            Settings
          </Typography>
        </Button>
      </Drawer>
    </Box>
  )
});