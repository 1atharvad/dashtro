import { Box, Skeleton } from '@mui/material';

export const DocumentSkeleton = () => (
  <Box className="document" sx={{ paddingTop: '72px' }}>
    <Box className="document-component">
      {/* Title bar — mirrors .document-component-title-bar padding (12px 24px) */}
      <Box className="document-component-title-bar" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Skeleton width={110} height={13} sx={{ mb: 0.5 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Skeleton width={220} height={26} />
            <Skeleton variant="rounded" width={64} height={22} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Skeleton variant="circular" width={30} height={30} />
          <Skeleton variant="circular" width={30} height={30} />
          <Skeleton variant="circular" width={30} height={30} />
          <Skeleton variant="rounded" width={108} height={36} />
        </Box>
      </Box>
      {/* Fields card — mirrors .document-fields structure */}
      <Box className="document-body">
        <Box className="document-fields">
          {[1, 2, 3, 4, 5].map(i => (
            <Box key={i} className="document-field-row">
              <Skeleton width={130} height={13} sx={{ mb: 0.75 }} />
              <Skeleton variant="rectangular" height={40} sx={{ borderRadius: '4px' }} />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  </Box>
);
