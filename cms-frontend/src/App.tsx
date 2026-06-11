import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { PageNotFound } from 'advi-ui';
import { Helmet } from 'react-helmet-async';
import '@/App.scss';
import { Schema } from '@ts/pages/Schema';
import { CollectionContent } from '@ts/pages/CollectionContent';
import { DocumentContent } from '@ts/pages/DocumentContent';
import { Login } from '@ts/pages/Login';
import { Signup } from '@ts/pages/Signup';
import { ProjectsList } from '@ts/pages/ProjectsList';
import { ProjectPage } from '@ts/pages/ProjectPage';
import { Box, useTheme } from '@mui/material';
import favicon32x32 from '@/assets/images/favicon-32x32.png';
import favicon16x16 from '@/assets/images/favicon-16x16.png';
import favicon from '@/assets/images/favicon.ico';
import appleIcon from '@/assets/images/apple-icon-180x180.png';
import { SettingsPage } from '@ts/pages/SettingsPage';
import { ProtectedRoute } from '@ts/components/ProtectedRoute';
import { RootState } from '@/redux/store';
import { useSelector } from "react-redux";

export const App = () => {
  const theme = useTheme();
  const rootPath = useSelector((state: RootState) => state.rootPath.value);

  return (
    <>
      <Helmet>
        <title>DashTro</title>
        <link rel="apple-touch-icon-precomposed" sizes="180x180" href={appleIcon} />
        <link rel="icon" type="image/png" sizes="32x32" href={favicon32x32} />
        <link rel="icon" type="image/png" sizes="16x16" href={favicon16x16} />
        <link rel="shortcut icon" href={favicon} />
      </Helmet>
      <Router basename={rootPath}>
        <Box className="page-content" sx={{ background: theme.palette.pageBkColor }}>
          <Routes>
            <Route path="/login/" element={<Login />} />
            <Route path="/signup/" element={<Signup />} />

            <Route path="/" element={<ProtectedRoute><ProjectsList /></ProtectedRoute>} />
            <Route path="/settings/:setting_type/" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

            <Route path="/projects/:project_id/" element={<ProtectedRoute><ProjectPage /></ProtectedRoute>} />

            <Route path="/projects/:project_id/schema/" element={<ProtectedRoute><Schema /></ProtectedRoute>} />
            <Route path="/projects/:project_id/schema/:schema_name/" element={<ProtectedRoute><Schema /></ProtectedRoute>} />

            <Route path="/projects/:project_id/workspace/:workspace_name/" element={<ProtectedRoute><CollectionContent /></ProtectedRoute>} />
            <Route path="/projects/:project_id/workspace/:workspace_name/collection/:collection_name/" element={<ProtectedRoute><CollectionContent /></ProtectedRoute>} />
            <Route path="/projects/:project_id/workspace/:workspace_name/collection/:collection_name/document/:document_id/" element={<ProtectedRoute><DocumentContent /></ProtectedRoute>} />

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Box>
      </Router>
    </>
  );
};
