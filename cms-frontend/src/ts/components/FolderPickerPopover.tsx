import { useState } from 'react';
import { Box, InputBase, Popover, Typography } from '@mui/material';
import { FolderOpen } from 'lucide-react';
import type { Category } from '@ts/types/constants';

export const FolderPickerPopover = ({
  anchorEl,
  onClose,
  categories,
  onSelect,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  categories: Category[];
  onSelect: (categoryId: string) => void;
}) => {
  const [filter, setFilter] = useState('');

  const handleClose = () => {
    setFilter('');
    onClose();
  };

  const matches = categories.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      slotProps={{
        paper: { sx: { width: 200, mt: 0.5, borderRadius: 1.5 } },
      }}
    >
      <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <InputBase
          autoFocus
          fullWidth
          placeholder="Search folders…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') handleClose(); }}
          sx={{ fontSize: 13 }}
        />
      </Box>
      <Box sx={{ maxHeight: 200, overflowY: 'auto', py: 0.5 }}>
        {matches.length === 0 ? (
          <Typography sx={{ display: 'block', px: 1.5, py: 1, fontSize: 13, color: 'text.secondary' }}>
            {categories.length === 0 ? 'No folders yet' : 'No match'}
          </Typography>
        ) : matches.map(cat => (
          <Box
            key={cat.id}
            onClick={() => { onSelect(cat.id); handleClose(); }}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 1.5, py: 0.75, cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <FolderOpen className="h-3.5 w-3.5" style={{ opacity: 0.45 }} />
            <Typography sx={{ fontSize: 13 }}>{cat.name}</Typography>
          </Box>
        ))}
      </Box>
    </Popover>
  );
};
