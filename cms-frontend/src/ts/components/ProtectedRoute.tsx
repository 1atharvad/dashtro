import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  // The idToken lives in an httpOnly cookie, unreadable by JS, so auth state
  // can't be determined synchronously here — ask the backend instead.
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authFetch(`${API_BASE_URL}/auth/`)
      .then(res => {
        if (!cancelled) setAllowed(res.ok);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <CircularProgress size={32} />
    </Box>
  );
  if (!allowed) return <Navigate to="/login/" state={{ from: location }} replace />;
  return <>{children}</>;
};
