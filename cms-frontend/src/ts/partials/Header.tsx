import '../../scss/Header.scss';
import dashtroLogo from '../../assets/images/favicon-96x96.png';
import { Link } from '../components/Link';
import type { CustomLink } from '@ts/types/constants';
import { Box } from '@mui/material';

interface Image {
  url: string,
  alt_text: string
}

interface Logo {
  name: string,
  link: CustomLink,
  image: Image,
}

interface Header_ {
  logo: Logo,
  cta_links: CustomLink[],
}

const header: Header_ = {
  logo: {
    name: 'DashTro!',
    link: {
      text: '',
      url: '/admin/',
      is_external_link: false
    },
    image: {
      url: dashtroLogo,
      alt_text: 'Dashtro Logo'
    }
  },
  cta_links: []
};

export const Header = () => {
  const HeaderLogo = ({logo}: {logo: Logo}) => (
    <Box className="header-logo">
      <Link 
          link={logo.link} 
          className='header-logo-link'>
        <Box className="header-logo-container">
          <img className="logo-image" src={logo.image.url} alt={logo.image.alt_text}/>
          <span className="logo-name">{logo.name}</span>
        </Box>
      </Link>
    </Box>
  );

  const HamburgerButton = () => (
    <Box className="header-cta modal-wrapper">
      <button
          className="solid-btn modal-btn hamburger-btn"
          title="Menu Button"
          data-modal-id="hamburger-menu">
        <ul className="hamburger-menu">
          {[...Array(3)].map((_, i) => (
            <li className={`line line-${i}`} key={`line${i}`} />
          ))}
        </ul>
      </button>
    </Box>
  );

  return (
    <header className="app-header">
      <Box className="mobile-header">
        <HeaderLogo logo={header.logo} />
        {header.cta_links.length > 0 && HamburgerButton()}
      </Box>
      <Box className="desktop-header">
        <HeaderLogo logo={header.logo} />
        <Box className="header-cta">
          {header.cta_links.map((link) => (
            <Link 
                link={link} 
                className='header-cta-link js-button'>
              {link.text}
            </Link>
          ))}
        </Box>
      </Box>
    </header>
  )
}
