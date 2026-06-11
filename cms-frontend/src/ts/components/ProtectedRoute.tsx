import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getToken, isTokenExpired, refreshTokens } from '@ts/utils/auth';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const check = async () => {
      const token = getToken();
      if (!token) {
        setAllowed(false);
        setChecking(false);
        return;
      }
      if (!isTokenExpired(token)) {
        setAllowed(true);
        setChecking(false);
        return;
      }
      const ok = await refreshTokens();
      if (!ok) {
        setAllowed(false);
        setChecking(false);
        return;
      }
      setAllowed(true);
      setChecking(false);
    };
    check();
  }, []);

  if (checking) return null;
  if (!allowed) return <Navigate to="/login/" state={{ from: location }} replace />;
  return <>{children}</>;
};
