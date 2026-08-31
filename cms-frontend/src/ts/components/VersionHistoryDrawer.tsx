import { Box, Drawer, IconButton, List, ListItem, ListItemButton, Typography } from '@mui/material';
import { X } from 'lucide-react';
import type { DocumentVersion } from '@ts/types/constants';

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
};

export const VersionHistoryDrawer = ({
  open,
  onClose,
  versions,
  documentId,
  restoreVersion,
}: {
  open: boolean;
  onClose: () => void;
  versions: DocumentVersion[];
  documentId?: string;
  restoreVersion: (documentId: string, versionId: string) => Promise<unknown>;
}) => {
  const handleRestore = async (versionId: string) => {
    if (!documentId) return;
    await restoreVersion(documentId, versionId);
    onClose();
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}
      PaperProps={{ sx: { width: 320, p: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle1" fontWeight={700}>Version History</Typography>
        <IconButton size="small" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </Box>

      {versions.length === 0 ? (
        <Box sx={{ px: 2.5, py: 3 }}>
          <Typography variant="body2" color="text.secondary">No versions saved yet. Versions are created each time you save.</Typography>
        </Box>
      ) : (
        <List disablePadding>
          {versions.map((v, i) => (
            <ListItem key={v.id} disablePadding divider>
              <ListItemButton
                onClick={() => handleRestore(v.id)}
                disabled={i === 0}
                sx={{ px: 2.5, py: 1.5, flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <Typography variant="body2" fontWeight={600}>
                    {i === 0 ? 'Current version' : `Version ${v.version_number}`}
                  </Typography>
                  {i !== 0 && (
                    <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                      Restore
                    </Typography>
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">{formatDate(v.created_at)}</Typography>
                {v.created_by_email && (
                  <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>
                    {v.created_by_email}
                  </Typography>
                )}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}
    </Drawer>
  );
};
