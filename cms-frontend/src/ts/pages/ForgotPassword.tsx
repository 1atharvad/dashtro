import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { Box, TextField, Typography } from "@mui/material";
import { Button, toast } from "advi-ui";
import { API_BASE_URL } from "@ts/config";
import dashtroLogo from '@/assets/images/favicon-96x96.png';
import '@/scss/Login.scss';

export const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);

    try {
      await fetch(`${API_BASE_URL}/auth/forgot-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always show the same generic success state, whether or not the
      // email is registered — the backend never reveals account existence.
      setSent(true);
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
          Reset your password
        </Typography>

        {sent ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            If that email is registered, a reset link has been sent. It expires in 15 minutes.
          </Typography>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Enter your email and we'll send you a reset link.
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
              <Button type="submit" variant="default" disabled={loading} className="w-full justify-center mt-1">
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </Box>
          </>
        )}

        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Link to="/login/" className="login-link">Back to sign in</Link>
        </Box>
      </Box>
    </Box>
  );
};
