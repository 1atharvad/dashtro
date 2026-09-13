import { ReactNode, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '@mui/material';
import { Menu } from 'lucide-react';
import { PageAside, AsideDrawer, AsideItem, AsideBtn, Button, LogoLink } from 'advi-ui';
import { useUser } from '@ts/context/userContextValue';
import dashtroLogo from '@/assets/images/favicon-96x96.png';
import type { DrawerFooterSlotProps } from '@ts/types/constants';

interface LinkDrawerProps {
  className?: string;
  items: AsideItem[];
  subItems?: AsideItem[];
  /** Rendered below the built-in settings button. Receives sidebar open state. */
  settingsFooter?: (props: DrawerFooterSlotProps) => ReactNode;
  /** Generic footer slot rendered after settingsFooter. */
  footer?: (isOpen: boolean) => ReactNode;
}

export const LinkDrawer = ({
  className, items, subItems,
  settingsFooter, footer,
}: LinkDrawerProps) => {
  const navigate = useNavigate();
  const { user, refreshUser } = useUser();
  const { project_id } = useParams<{ project_id?: string }>();
  const logoUrl = project_id ? `/projects/${project_id}/` : '/projects/';
  const [open, setOpen] = useState(() => localStorage.getItem('sidebarCollapsed') !== 'true');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      refreshUser();
    }
  }, [user, refreshUser]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem('sidebarCollapsed', String(!next));
  };

  const drawerFooter = (isOpen: boolean): ReactNode => (
    <>
      {settingsFooter?.({ isOpen })}
      {footer?.(isOpen)}
      <AsideBtn
        className='avatar-profile-btn'
        icon={<Avatar src={user?.avatarUrl} sx={{ width: 28, height: 28, fontSize: '0.75rem' }}>{user?.initials}</Avatar>}
        label={user?.displayName ?? 'Profile'}
        onClick={() => navigate('/settings/profile/')}
      />
    </>
  );

  const mobileItems = (subItems ? [...items, ...subItems] : items).map(item => (
    item.onClick ? { ...item, onClick: () => { item.onClick?.(); setMobileOpen(false); } } : item
  ));

  const logoLink = (
    <LogoLink
      name={open ? 'DashTro!' : ''}
      image={{ url: dashtroLogo, alt: 'DashTro Logo' }}
      link={{ url: logoUrl, isExternal: false }}
    />
  );

  const mobileLogoLink = (
    <LogoLink
      name='DashTro!'
      image={{ url: dashtroLogo, alt: 'DashTro Logo' }}
      link={{ url: logoUrl, isExternal: false }}
    />
  );

  return (
    <>
      <PageAside
        className={`${className} hidden md:flex`}
        items={open && subItems ? [...items, ...subItems] : items}
        open={open}
        onToggle={handleToggle}
        openWidth="w-72"
        title={logoLink}
        footer={drawerFooter}
      />

      <div className="link-drawer-mobile-header flex md:hidden items-center justify-between px-3 py-2">
        {mobileLogoLink}
        <AsideDrawer
          className={className}
          items={mobileItems}
          open={mobileOpen}
          onOpenChange={setMobileOpen}
          openWidth="w-72"
          title={mobileLogoLink}
          footer={drawerFooter}
          trigger={(
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          )}
        />
      </div>
    </>
  );
};
