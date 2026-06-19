import { useEffect, useState } from 'react';
import { Avatar, Box, Divider, IconButton, TextField, Typography } from '@mui/material';
import { Camera as PhotoCamera } from 'lucide-react';
import { Button, Card, CardContent, Badge, toast } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { useUser } from '@ts/context/UserContext';

export const SettingsProfile = () => {
  const { user: currentUser, refreshUser } = useUser();
  const [user, setUser] = useState<{ uid: string; email: string } | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  useEffect(() => {
    if (currentUser) {
      setUser({ uid: currentUser.uid, email: currentUser.email });
      setFirstName(currentUser.firstName);
      setLastName(currentUser.lastName);
    }
  }, [currentUser]);

  const handleSave = async () => {
    await authFetch(`${API_BASE_URL}/auth/profile/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName }),
    }).catch(() => {});
    await refreshUser();
    toast.success('Profile saved');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Avatar card — same style as original */}
      <Card>
        <CardContent style={{ textAlign: 'center', padding: '2rem' }}>
          <Box sx={{ position: 'relative', display: 'inline-block', mb: 2 }}>
            <Avatar sx={{ width: 100, height: 100, mx: 'auto', mb: 2, fontSize: '2rem' }}>
              {currentUser?.initials || '?'}
            </Avatar>
            <input accept="image/*" style={{ display: 'none' }} id="avatar-upload" type="file" />
            <label htmlFor="avatar-upload">
              <IconButton
                color="primary"
                component="span"
                sx={{
                  position: 'absolute', bottom: 8, right: 0,
                  bgcolor: 'background.paper', boxShadow: 1,
                  '&:hover': { bgcolor: 'grey.50' },
                }}
              >
                <PhotoCamera className="h-4 w-4" />
              </IconButton>
            </label>
          </Box>
          <p style={{ fontWeight: 600, fontSize: '1.1rem', margin: '0 0 4px' }}>{[firstName, lastName].filter(Boolean).join(' ') || '—'}</p>
          <p style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem', margin: '0 0 12px' }}>
            {user?.email || '—'}
          </p>
          {currentUser?.role && <Badge variant="outline">{currentUser.role}</Badge>}
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardContent style={{ padding: '1.5rem' }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>Edit Profile</Typography>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <TextField
                label="First name"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                autoComplete="given-name"
              />
              <TextField
                label="Last name"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                autoComplete="family-name"
              />
            </Box>
            <TextField
              label="Email"
              value={user?.email || ''}
              fullWidth
              disabled
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              label="User ID"
              value={user?.uid || ''}
              fullWidth
              disabled
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Box>
              <Button variant="default" className="border-current" onClick={handleSave} disabled={!firstName && !lastName}>
                Save Changes
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
