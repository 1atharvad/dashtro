import { Box, Typography } from '@mui/material';

export const HeatmapLegend = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Typography variant="caption" color="text.secondary">Less</Typography>
    {([0, 1, 2, 3, 4] as const).map(i => (
      <Box
        key={i}
        sx={{
          width: 11, height: 11, borderRadius: '2px',
          backgroundColor: `var(--heatmap-${i})`,
        }}
      />
    ))}
    <Typography variant="caption" color="text.secondary">More</Typography>
  </Box>
);
