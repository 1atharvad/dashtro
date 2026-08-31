import { Box, Typography } from '@mui/material';
import { DAY_LABELS, HEATMAP_CELL_MONTH, HEATMAP_GAP } from '@ts/data/content';
import { HeatCell } from './HeatCell';
import { getIntensity, type HeatmapDay } from './heatmap';

export const MonthHeatmapGrid = ({ grid, max }: { grid: (HeatmapDay | null)[][]; max: number }) => (
  <Box sx={{ display: 'inline-flex', flexDirection: 'column', gap: 0, userSelect: 'none' }}>
    {/* Day-of-week header */}
    <Box sx={{ display: 'flex', gap: `${HEATMAP_GAP}px`, mb: '6px' }}>
      {DAY_LABELS.map(d => (
        <Box key={d} sx={{ width: HEATMAP_CELL_MONTH, textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
            {d}
          </Typography>
        </Box>
      ))}
    </Box>

    {/* Calendar rows */}
    {grid.map((row, ri) => (
      <Box key={ri} sx={{ display: 'flex', gap: `${HEATMAP_GAP}px`, mb: `${HEATMAP_GAP}px` }}>
        {row.map((day, di) => (
          <Box key={di} sx={{ position: 'relative' }}>
            <HeatCell
              day={day}
              intensity={day ? getIntensity(day.count, max) : 0}
              size={HEATMAP_CELL_MONTH}
            />
            {day && (
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  bottom: 2,
                  right: 3,
                  fontSize: '0.55rem',
                  lineHeight: 1,
                  color: day.count > 0 ? 'rgba(255,255,255,0.7)' : 'text.disabled',
                  pointerEvents: 'none',
                }}
              >
                {new Date(day.date + 'T12:00:00').getDate()}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    ))}
  </Box>
);
