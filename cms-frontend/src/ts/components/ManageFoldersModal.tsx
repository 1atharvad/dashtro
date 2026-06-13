import { useState } from 'react';
import {
  Box, Dialog, DialogContent, DialogTitle,
  IconButton, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { Check, X, Trash2, Pencil, FolderPlus } from 'lucide-react';
import { Button } from 'advi-ui';
import { useCategory } from '@/hooks/useCategory';

export const ManageFoldersModal = ({
  projectId,
  open,
  onClose,
  schemaNames = [],
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  schemaNames?: string[];
}) => {
  const { categories, categoryMap, addCategory, removeCategory, updateCategory } = useCategory(projectId);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const countForCategory = (catId: string) =>
    schemaNames.filter(n => (categoryMap[n] ?? '') === catId).length;

  const generalCount = schemaNames.filter(n => !categoryMap[n]).length;

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addCategory(name);
    setNewName('');
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
    setConfirmDelete(null);
  };

  const commitEdit = () => {
    if (editName.trim() && editingId) updateCategory(editingId, editName.trim());
    setEditingId(null);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Manage Folders
        <IconButton size="small" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="New folder name"
            value={newName}
            autoComplete="off"
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
          <Button variant="default" className="border-current" onClick={handleAdd} disabled={!newName.trim()}>
            <FolderPlus className="h-4 w-4" /> Add
          </Button>
        </Box>

        <Box className="settings-table">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Folder</TableCell>
                <TableCell align="right" sx={{ width: 80 }}>Schemas</TableCell>
                <TableCell sx={{ width: 96 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">General</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" color="text.secondary">{generalCount}</Typography>
                </TableCell>
                <TableCell />
              </TableRow>

              {categories.map(cat => (
                <TableRow key={cat.id}>
                  <TableCell>
                    {editingId === cat.id ? (
                      <TextField
                        size="small"
                        value={editName}
                        autoFocus
                        autoComplete="off"
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        sx={{ '& .MuiInputBase-root': { height: 28 } }}
                      />
                    ) : (
                      <Typography variant="body2">{cat.name}</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="text.secondary">{countForCategory(cat.id)}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    {editingId === cat.id ? (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Save">
                          <IconButton size="small" color="primary" onClick={commitEdit}>
                            <Check className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4" />
                        </IconButton>
                      </Box>
                    ) : confirmDelete === cat.id ? (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Confirm delete — schemas move to General">
                          <IconButton size="small" color="error" onClick={() => { removeCategory(cat.id); setConfirmDelete(null); }}>
                            <Check className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => setConfirmDelete(null)}>
                          <X className="h-4 w-4" />
                        </IconButton>
                      </Box>
                    ) : (
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => startEdit(cat.id, cat.name)}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton size="small" onClick={() => { setConfirmDelete(cat.id); setEditingId(null); }}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} sx={{ textAlign: 'center', py: 3 }}>
                    <Typography variant="body2" color="text.secondary">No custom folders yet.</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </DialogContent>

    </Dialog>
  );
};
