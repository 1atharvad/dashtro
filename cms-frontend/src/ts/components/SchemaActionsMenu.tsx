import { useState } from 'react';
import { Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip } from '@mui/material';
import { Download, FolderOpen, Lock, MoreVertical, Save, Trash2, Unlock, Upload } from 'lucide-react';

export const SchemaActionsMenu = ({
  onSave,
  onImport,
  folderLabel,
  onManageFolder,
  isLocked,
  onToggleLock,
  onDownload,
  onDelete,
}: {
  onSave?: () => void;
  onImport?: () => void;
  folderLabel?: string;
  onManageFolder?: (anchorEl: HTMLElement) => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
}) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const close = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title="Actions">
        <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)}>
          <MoreVertical className="h-4 w-4" />
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
        {onSave && (
          <MenuItem onClick={() => { close(); onSave(); }} sx={{ fontSize: 13 }}>
            <ListItemIcon><Save className="h-4 w-4" /></ListItemIcon>
            Save Schema
          </MenuItem>
        )}
        {onImport && (
          <MenuItem onClick={() => { close(); onImport(); }} sx={{ fontSize: 13 }}>
            <ListItemIcon><Upload className="h-4 w-4" /></ListItemIcon>
            Import from JSON
          </MenuItem>
        )}
        {onManageFolder && (
          <MenuItem onClick={(e) => { close(); onManageFolder(e.currentTarget); }} sx={{ fontSize: 13 }}>
            <ListItemIcon><FolderOpen className="h-4 w-4" /></ListItemIcon>
            {folderLabel ?? 'Add folder'}
          </MenuItem>
        )}
        {(onSave || onImport || onManageFolder) && (onToggleLock || onDownload || onDelete) && <Divider />}
        {onToggleLock && (
          <MenuItem onClick={() => { close(); onToggleLock(); }} sx={{ fontSize: 13 }}>
            <ListItemIcon>
              {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </ListItemIcon>
            {isLocked ? 'Unlock Schema' : 'Lock Schema'}
          </MenuItem>
        )}
        {onDownload && (
          <MenuItem onClick={() => { close(); onDownload(); }} sx={{ fontSize: 13 }}>
            <ListItemIcon><Download className="h-4 w-4" /></ListItemIcon>
            Download Schema
          </MenuItem>
        )}
        {onDelete && <Divider />}
        {onDelete && (
          <MenuItem onClick={() => { close(); onDelete(); }} sx={{ color: 'error.main', fontSize: 13 }}>
            <ListItemIcon sx={{ color: 'error.main' }}>
              <Trash2 className="h-4 w-4" />
            </ListItemIcon>
            Delete Schema
          </MenuItem>
        )}
      </Menu>
    </>
  );
};
