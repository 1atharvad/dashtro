import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Helmet } from 'react-helmet-async';
import '@/App.scss';
// import { Header } from '@ts/partials/Header'
import { Schema } from '@ts/pages/Schema'
import { CollectionContent } from '@ts/pages/CollectionContent';
import { DocumentContent } from '@ts/pages/DocumentContent';
import { Login } from '@ts/pages/Login';
import { Box, useTheme } from '@mui/material';
import favicon32x32 from '@/assets/images/favicon-32x32.png';
import favicon16x16 from '@/assets/images/favicon-16x16.png';
import favicon from '@/assets/images/favicon.ico';
import appleIcon from '@/assets/images/apple-icon-180x180.png';
import { SettingsPage } from '@ts/pages/SettingsPage';
import { RootState } from '@/redux/store';
import { useSelector } from "react-redux";

export const App = () => {
  const theme = useTheme();
  const rootPath = useSelector((state: RootState) => state.rootPath.value);

  return (
    <>
      <Helmet>
        <title>DashTro</title>
        <link rel="apple-touch-icon-precomposed" sizes="180x180" href={appleIcon}/>
        <link rel="icon" type="image/png" sizes="32x32" href={favicon32x32}/>
        <link rel="icon" type="image/png" sizes="16x16" href={favicon16x16}/>
        <link rel="shortcut icon" href={favicon}/>
      </Helmet>
      <Router basename={rootPath}>
        {/* <Header/> */}
        <Box className="page-content" sx={{background: theme.palette.pageBkColor}}>
          <Routes>
            <Route path={'/login/'} element={<Login/>} />
            <Route path={'/workspace/:workspace_name/'} element={<CollectionContent/>} />
            <Route path={'/settings/:setting_type/'} element={<SettingsPage/>} />
            <Route path={'/workspace/:workspace_name/collection/:collection_name/'} element={<CollectionContent/>} />
            <Route path={'/workspace/:workspace_name/collection/:collection_name/document/:document_id/'} element={<DocumentContent/>} />
            <Route path={'/schema/'} element={<Schema/>}/>
            <Route path={'/schema/:schema_name'} element={<Schema/>}/>
            {/* <Route path="*" element={<NotFound />} /> */}
          </Routes>
        </Box>
      </Router>
    </>
  )
}
