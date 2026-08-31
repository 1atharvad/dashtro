import { Box, Skeleton } from '@mui/material';

export const CollectionSkeleton = () => (
  <Box className="collection" sx={{ display: 'flex', minHeight: '100vh' }}>
    {/* Sidebar — mirrors .collection-drawer / LinkDrawer structure */}
    <Box sx={{ width: 240, flexShrink: 0, borderRight: '1px solid', borderColor: 'divider', pt: 2, px: 1.5 }}>
      <Skeleton width="55%" height={13} sx={{ mb: 2, ml: 1 }} />
      {[1, 2, 3, 4].map(i => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1, py: 0.75, mb: 0.5 }}>
          <Skeleton variant="rounded" width={20} height={20} />
          <Skeleton width="65%" height={14} />
        </Box>
      ))}
    </Box>
    {/* Content — mirrors .collection-content + document list */}
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, px: 1 }}>
        <Skeleton width={180} height={28} />
        <Skeleton variant="rounded" width={120} height={36} />
      </Box>
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, minHeight: 48, borderBottom: i < 6 ? '1px solid' : 'none', borderColor: 'divider' }}>
            <Skeleton variant="circular" width={14} height={14} />
            <Skeleton width={`${30 + (i * 7) % 30}%`} height={14} />
            <Skeleton variant="rounded" width={58} height={18} sx={{ ml: 'auto' }} />
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);
