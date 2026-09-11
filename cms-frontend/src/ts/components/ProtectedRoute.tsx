import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useUser } from '@ts/context/userContextValue';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user, checked, refreshUser } = useUser();

  // The idToken lives in an httpOnly cookie, unreadable by JS, so auth state
  // can't be determined synchronously here — ask the backend instead, via
  // the same UserContext check every other consumer uses (refreshUser
  // de-dupes concurrent callers into one request, so this never duplicates
  // UserProvider's own initial check).
  useEffect(() => {
    if (!checked) refreshUser();
  }, [checked, refreshUser]);

  if (!checked) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <CircularProgress size={32} />
    </Box>
  );
  if (!user) return <Navigate to="/login/" state={{ from: location }} replace />;
  return <>{children}</>;
};
