import { forwardRef, ReactNode, useImperativeHandle, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '@mui/material';
import { PageAside, AsideItem, AsideBtn, LogoLink } from 'advi-ui';
import { useUser } from '@ts/context/UserContext';
import dashtroLogo from '@/assets/images/favicon-96x96.png';

export interface DrawerFooterSlotProps {
  isOpen: boolean;
}

interface LinkDrawerProps {
  className?: string;
  items: AsideItem[];
  subItems?: AsideItem[];
  /** Rendered below the built-in settings button. Receives sidebar open state. */
  settingsFooter?: (props: DrawerFooterSlotProps) => ReactNode;
  /** Generic footer slot rendered after settingsFooter. */
  footer?: (isOpen: boolean) => ReactNode;
}

export const LinkDrawer = forwardRef(({
  className, items, subItems,
  settingsFooter, footer,
}: LinkDrawerProps, ref) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { project_id } = useParams<{ project_id?: string }>();
  const logoUrl = project_id ? `/projects/${project_id}/` : '/';
  const [open, setOpen] = useState(() => localStorage.getItem('sidebarCollapsed') !== 'true');

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem('sidebarCollapsed', String(!next));
  };

  useImperativeHandle(ref, () => ({
    handleDrawerToggle: handleToggle,
  }), [open]);

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

  return (
    <PageAside
      className={className}
      items={open && subItems ? [...items, ...subItems] : items}
      open={open}
      onToggle={handleToggle}
      openWidth="w-72"
      title={
        <LogoLink
          name={open ? 'DashTro!' : ''}
          image={{ url: dashtroLogo, alt: 'DashTro Logo' }}
          link={{ url: logoUrl, isExternal: false }}
        />
      }
      footer={drawerFooter}
    />
  );
});
