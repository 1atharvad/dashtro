import { useState } from 'react';
import { Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material';
import { Download, Lock, MoreHorizontal, Trash2, Unlock } from 'lucide-react';

export const SchemaActionsMenu = ({
  isLocked,
  onToggleLock,
  onDownload,
  onDelete,
}: {
  isLocked: boolean;
  onToggleLock: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const close = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title="Actions">
        <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)}>
          <MoreHorizontal className="h-4 w-4" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={close}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        slotProps={{ paper: { sx: { width: 200, mt: 0.5, borderRadius: 1.5 } } }}
      >
        <MenuItem onClick={() => { close(); onToggleLock(); }} sx={{ fontSize: 13 }}>
          <ListItemIcon>
            {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </ListItemIcon>
          {isLocked ? 'Unlock Schema' : 'Lock Schema'}
        </MenuItem>
        <MenuItem onClick={() => { close(); onDownload(); }} sx={{ fontSize: 13 }}>
          <ListItemIcon><Download className="h-4 w-4" /></ListItemIcon>
          Download Schema
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { close(); onDelete(); }} sx={{ color: 'error.main', fontSize: 13 }}>
          <ListItemIcon sx={{ color: 'error.main' }}>
            <Trash2 className="h-4 w-4" />
          </ListItemIcon>
          Delete Schema
        </MenuItem>
      </Menu>
    </>
  );
};
