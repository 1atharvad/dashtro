import { useState } from 'react';
import { Box, Divider, TextField, Typography } from '@mui/material';
import { Card, CardContent, Button, toast } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';

export const SettingsSecurity = () => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = next && confirm && next !== confirm;
  const weak = next && next.length < 8;

  const handleSubmit = async () => {
    if (mismatch || weak) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/auth/change-password/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      if (res.ok) {
        toast.success('Password updated successfully.');
        setCurrent(''); setNext(''); setConfirm('');
      } else {
        const d = await res.json();
        toast.error(d.detail || 'Failed to update password.');
      }
    } catch {
      toast.error('Network error. Please try again.');
    }
  };

  return (
    <Card>
      <CardContent style={{ padding: '1.5rem' }}>
        <Typography variant="subtitle1" fontWeight={700}>Security</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Update your password</Typography>
        <Divider sx={{ mb: 2 }} />

        <Box component="form" onSubmit={e => { e.preventDefault(); handleSubmit(); }} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <input type="text" autoComplete="username" style={{ display: 'none' }} readOnly value="" />
          <TextField
            label="Current Password"
            type="password"
            value={current}
            onChange={e => setCurrent(e.target.value)}
            fullWidth
            autoComplete="current-password"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="New Password"
            type="password"
            value={next}
            onChange={e => setNext(e.target.value)}
            fullWidth
            error={!!weak}
            helperText={weak ? 'Minimum 8 characters' : ''}
            autoComplete="new-password"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Confirm New Password"
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            fullWidth
            error={!!mismatch}
            helperText={mismatch ? 'Passwords do not match' : ''}
            autoComplete="new-password"
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <Box>
            <Button type="submit" variant="default" className="border-current" disabled={!current || !next || !confirm || !!mismatch || !!weak}>
              Update Password
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
