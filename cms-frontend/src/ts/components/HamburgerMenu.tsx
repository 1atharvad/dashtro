import { IconButton } from '@mui/material';
import { Menu as MenuIcon} from '@mui/icons-material';

export const HamburgerMenu = ({
  className='',
  ariaLabel='hamburger menu',
  handleDrawerToggle
}: {
  className?: string,
  ariaLabel?: string,
  handleDrawerToggle: () => void
}) => {
  return (
    <IconButton
        className={className}
        color="inherit"
        aria-label={ariaLabel}
        onClick={handleDrawerToggle}>
      <MenuIcon />
    </IconButton>
  )
}