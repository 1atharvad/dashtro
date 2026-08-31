import { Box, Typography } from '@mui/material';
import { DAY_LABELS, HEATMAP_CELL, HEATMAP_GAP } from '@ts/data/content';
import { HeatCell } from './HeatCell';
import { getIntensity, type HeatmapDay } from './heatmap';

export type YearGrid = {
  weeks: (HeatmapDay | null)[][];
  monthPositions: { label: string; col: number }[];
};

export const YearHeatmapGrid = ({ grid, max }: { grid: YearGrid; max: number }) => (
  <Box sx={{ display: 'inline-flex', flexDirection: 'column', gap: 0, userSelect: 'none' }}>
    {/* Month labels */}
    <Box sx={{ display: 'flex', ml: `${HEATMAP_CELL + HEATMAP_GAP + 4}px`, mb: '4px' }}>
      {grid.monthPositions.map(({ label, col }, i) => {
        const nextCol = grid.monthPositions[i + 1]?.col ?? grid.weeks.length;
        const width = (nextCol - col) * (HEATMAP_CELL + HEATMAP_GAP);
        return (
          <Box key={col} sx={{ width, flexShrink: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {label}
            </Typography>
          </Box>
        );
      })}
    </Box>

    {/* Grid: day-of-week rows */}
    <Box sx={{ display: 'flex', gap: 0 }}>
      {/* Day labels */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: `${HEATMAP_GAP}px`, mr: '4px', mt: '1px' }}>
        {DAY_LABELS.map((d, i) => (
          <Box key={d} sx={{ height: HEATMAP_CELL, display: 'flex', alignItems: 'center' }}>
            {i % 2 === 1 && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', lineHeight: 1, whiteSpace: 'nowrap' }}>
                {d}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Week columns */}
      <Box sx={{ display: 'flex', gap: `${HEATMAP_GAP}px` }}>
        {grid.weeks.map((week, wi) => (
          <Box key={wi} sx={{ display: 'flex', flexDirection: 'column', gap: `${HEATMAP_GAP}px` }}>
            {week.map((day, di) => (
              <HeatCell
                key={di}
                day={day}
                intensity={day ? getIntensity(day.count, max) : 0}
                size={HEATMAP_CELL}
              />
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  </Box>
);
