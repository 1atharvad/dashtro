import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Box, TextField, Typography } from "@mui/material";
import { Button, toast } from "advi-ui";
import { API_BASE_URL } from "@ts/config";
import dashtroLogo from '@/assets/images/favicon-96x96.png';
import '@/scss/Login.scss';

export const Signup = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE_URL}/auth/owner-exists/`)
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          navigate("/login/", { replace: true });
        }
      })
      .catch(() => {});
  }, [navigate]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.detail ?? "Signup failed");
        return;
      }

      navigate("/login/", { replace: true, state: { signupSuccess: true } });
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
          Set up your account
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Create the owner account to get started
        </Typography>

        <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <TextField
              label="First name"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="given-name"
            />
            <TextField
              label="Last name"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="family-name"
            />
          </Box>
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
            autoComplete="new-password"
          />
          <TextField
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            fullWidth
            size="small"
            autoComplete="new-password"
          />
          <Button type="submit" variant="default" disabled={loading} className="w-full justify-center mt-1 border-current">
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
