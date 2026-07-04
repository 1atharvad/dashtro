import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { PageNotFound } from 'advi-ui';
import { Helmet } from 'react-helmet-async';
import '@/App.scss';
import { Box, Skeleton, useTheme } from '@mui/material';
import favicon32x32 from '@/assets/images/favicon-32x32.png';
import favicon16x16 from '@/assets/images/favicon-16x16.png';
import favicon from '@/assets/images/favicon.ico';
import appleIcon from '@/assets/images/apple-icon-180x180.png';
import { ProtectedRoute } from '@ts/components/ProtectedRoute';
import type { RootState } from '@ts/types/constants';
import { useSelector } from "react-redux";

const Schema = lazy(() => import('@ts/pages/Schema').then(m => ({ default: m.Schema })));
const RichTextComponentsList = lazy(() => import('@ts/pages/RichTextComponentsList').then(m => ({ default: m.RichTextComponentsList })));
const RichTextComponentEditor = lazy(() => import('@ts/pages/RichTextComponentEditor').then(m => ({ default: m.RichTextComponentEditor })));
const CollectionContent = lazy(() => import('@ts/pages/CollectionContent').then(m => ({ default: m.CollectionContent })));
const DocumentContent = lazy(() => import('@ts/pages/DocumentContent').then(m => ({ default: m.DocumentContent })));
const Login = lazy(() => import('@ts/pages/Login').then(m => ({ default: m.Login })));
const Signup = lazy(() => import('@ts/pages/Signup').then(m => ({ default: m.Signup })));
const ProjectsList = lazy(() => import('@ts/pages/ProjectsList').then(m => ({ default: m.ProjectsList })));
const ProjectPage = lazy(() => import('@ts/pages/ProjectPage').then(m => ({ default: m.ProjectPage })));
const RealtimeDatabase = lazy(() => import('@ts/pages/RealtimeDatabase').then(m => ({ default: m.RealtimeDatabase })));
const SettingsPage = lazy(() => import('@ts/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

const PageFallback = () => (
  <>
    {/* Mirrors the .vi-header bar so the page doesn't shift when the chunk loads */}
    <Box component="header" className="vi-header" sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1100, height: 64, display: 'flex', alignItems: 'center', px: 3, gap: 2 }}>
      <Skeleton variant="rounded" width={32} height={32} />
      <Skeleton width={90} height={20} />
      <Skeleton variant="circular" width={32} height={32} sx={{ ml: 'auto' }} />
    </Box>
    <Box sx={{ pt: '64px' }} />
  </>
);

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
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login/" element={<Login />} />
              <Route path="/signup/" element={<Signup />} />

              <Route path="/" element={<ProtectedRoute><ProjectsList /></ProtectedRoute>} />
              <Route path="/settings/:setting_type/" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

              <Route path="/projects/:project_id/" element={<ProtectedRoute><ProjectPage /></ProtectedRoute>} />
              <Route path="/projects/:project_id/rtdb/" element={<ProtectedRoute><RealtimeDatabase /></ProtectedRoute>} />

              <Route path="/projects/:project_id/schema/" element={<ProtectedRoute><Schema /></ProtectedRoute>} />
              <Route path="/projects/:project_id/schema/:schema_name/" element={<ProtectedRoute><Schema /></ProtectedRoute>} />
              <Route path="/projects/:project_id/schema/components/" element={<ProtectedRoute><RichTextComponentsList /></ProtectedRoute>} />
              <Route path="/projects/:project_id/schema/components/new/" element={<ProtectedRoute><RichTextComponentEditor /></ProtectedRoute>} />
              <Route path="/projects/:project_id/schema/components/:component_id/" element={<ProtectedRoute><RichTextComponentEditor /></ProtectedRoute>} />

              <Route path="/projects/:project_id/workspace/:workspace_name/" element={<ProtectedRoute><CollectionContent /></ProtectedRoute>} />
              <Route path="/projects/:project_id/workspace/:workspace_name/collection/:collection_name/" element={<ProtectedRoute><CollectionContent /></ProtectedRoute>} />
              <Route path="/projects/:project_id/workspace/:workspace_name/collection/:collection_name/document/:document_id/" element={<ProtectedRoute><DocumentContent /></ProtectedRoute>} />

              <Route path="*" element={<PageNotFound />} />
            </Routes>
          </Suspense>
        </Box>
      </Router>
    </>
  );
};
