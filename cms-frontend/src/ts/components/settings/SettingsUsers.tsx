import { useEffect, useState } from 'react';
import {
  Avatar, Box, IconButton, Tooltip, Typography,
  Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import { UserPlus, Trash2 } from 'lucide-react';
import { Button } from 'advi-ui';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { useUser } from '@ts/context/userContextValue';

type User = { uid: string; email: string; first_name: string; last_name: string; role: string };

export const SettingsUsers = () => {
  const { user: currentUser } = useUser();
  const [users, setUsers] = useState<User[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const load = () => {
    authFetch(`${API_BASE_URL}/auth/users/`)
      .then(r => r.ok ? r.json() : [])
      .then(setUsers)
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (uid: string) => {
    await authFetch(`${API_BASE_URL}/auth/users/${uid}/`, { method: 'DELETE' });
    load();
  };

  const inviteLink = inviteEmail
    ? `${window.location.origin}/signup/?invite=${encodeURIComponent(inviteEmail)}`
    : '';

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setInviteOpen(false);
    setInviteEmail('');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box className="settings-section">
        <Box className="settings-section-header" sx={{ flexDirection: 'row !important', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Team Members</Typography>
            <Typography variant="body2" color="text.secondary">Manage who has access to this CMS</Typography>
          </Box>
          <Button variant="default" className="border-current" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite User
          </Button>
        </Box>

        <Box className="settings-section-body" sx={{ pt: '0 !important' }}>
          <Box className="settings-table">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>User</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.uid}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 30, height: 30, fontSize: '0.7rem', bgcolor: 'var(--cms-chrome)' }}>
                          {u.first_name ? `${u.first_name[0]}${u.last_name?.[0] ?? ''}`.toUpperCase() : u.email.slice(0, 2).toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email.split('@')[0]}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={u.role} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={u.uid === currentUser?.uid ? "Can't remove yourself" : 'Remove user'}>
                        <span>
                          <IconButton
                            size="small"
                            disabled={u.uid === currentUser?.uid}
                            onClick={() => handleRemove(u.uid)}
                            sx={{ opacity: u.uid === currentUser?.uid ? 0.3 : 1 }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Box>
      </Box>

      <Dialog open={inviteOpen} onClose={() => { setInviteOpen(false); setInviteEmail(''); }} fullWidth maxWidth="xs">
        <DialogTitle>Invite User</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary">
            Enter their email to generate a signup link. Share it with them directly.
          </Typography>
          <TextField
            fullWidth size="small" label="Email address" type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            autoFocus
          />
          {inviteLink && (
            <TextField
              fullWidth size="small" label="Invite link"
              value={inviteLink} disabled
              slotProps={{ inputLabel: { shrink: true } }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button variant="secondary" className="border-current" onClick={() => { setInviteOpen(false); setInviteEmail(''); }}>
            Cancel
          </Button>
          <Button variant="default" className="border-current" onClick={copyLink} disabled={!inviteEmail}>
            Copy Link
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
