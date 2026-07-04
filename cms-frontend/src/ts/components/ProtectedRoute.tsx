import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { getToken, isTokenExpired, refreshTokens } from '@ts/utils/auth';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  // Synchronously determine initial state from localStorage — no render delay
  // for the common case where the token is still valid.
  const [checking, setChecking] = useState<boolean>(() => {
    const token = getToken();
    return !!token && isTokenExpired(token);
  });
  const [allowed, setAllowed] = useState<boolean>(() => {
    const token = getToken();
    return !!token && !isTokenExpired(token);
  });

  useEffect(() => {
    if (!checking) return;
    refreshTokens().then(ok => {
      setAllowed(ok);
      setChecking(false);
    });
  }, [checking]);

  if (checking) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <CircularProgress size={32} />
    </Box>
  );
  if (!allowed) return <Navigate to="/login/" state={{ from: location }} replace />;
  return <>{children}</>;
};
