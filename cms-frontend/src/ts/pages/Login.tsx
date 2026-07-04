import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Box, TextField, Typography } from "@mui/material";
import { Button, toast } from "advi-ui";
import { API_BASE_URL } from "@ts/config";
import dashtroLogo from '@/assets/images/favicon-96x96.png';
import '@/scss/Login.scss';

export const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ownerExists, setOwnerExists] = useState(true);

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/owner-exists/`)
      .then(res => res.json())
      .then(data => setOwnerExists(data.exists))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.detail ?? "Login failed");
        return;
      }

      const data = await res.json();
      localStorage.setItem("idToken", data.idToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("localId", data.localId);
      navigate(from, { replace: true });
    } catch {
      toast.error("Network error — could not reach the server");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="login-page">
      <Box className="login-card">
        <Box className="login-brand">
          <img src={dashtroLogo} alt="DashTro" className="login-logo" />
          <Typography className="login-brand-name">DashTro</Typography>
        </Box>

        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          Sign in
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter your credentials to continue
        </Typography>

        <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="current-password"
          />
          <Button type="submit" variant="default" disabled={loading} className="w-full justify-center mt-1 border-current">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          {!ownerExists && (
            <Typography variant="body2" color="text.secondary" textAlign="center">
              <Link to="/signup/" style={{ color: "inherit" }}>Set up your account →</Link>
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};
