import { useState, FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Box, TextField, Typography } from "@mui/material";
import { Button, toast } from "advi-ui";
import { API_BASE_URL } from "@ts/config";
import dashtroLogo from '@/assets/images/favicon-96x96.png';
import '@/scss/Login.scss';

export const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.detail ?? "Could not reset password");
        return;
      }

      toast.success("Password updated — please sign in");
      navigate("/login/", { replace: true });
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
          Choose a new password
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Reset links expire 15 minutes after being requested.
        </Typography>

        <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
          <TextField
            label="New password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="new-password"
          />
          <TextField
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="new-password"
          />
          <Button type="submit" variant="default" disabled={loading || !token} className="w-full justify-center mt-1">
            {loading ? "Updating…" : "Update password"}
          </Button>
        </Box>

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Link to="/login/" className="login-link">Back to sign in</Link>
        </Box>
      </Box>
    </Box>
  );
};
