import { Box, Tooltip } from '@mui/material';
import { ACTION_LABELS, HEATMAP_CELL } from '@ts/data/content';
import type { HeatmapDay } from './heatmap';

export const HeatCell = ({
  day,
  intensity,
  size = HEATMAP_CELL,
}: {
  day: HeatmapDay | null;
  intensity: 0 | 1 | 2 | 3 | 4;
  size?: number;
}) => {
  const colors = [
    'var(--heatmap-0)',
    'var(--heatmap-1)',
    'var(--heatmap-2)',
    'var(--heatmap-3)',
    'var(--heatmap-4)',
  ];

  const cell = (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '3px',
        backgroundColor: colors[intensity],
        flexShrink: 0,
        transition: 'opacity 0.1s',
        '&:hover': { opacity: 0.8 },
      }}
    />
  );

  if (!day || day.count === 0) return cell;

  const label = `${day.date}: ${day.count} operation${day.count !== 1 ? 's' : ''}${
    day.top_action ? ` · ${ACTION_LABELS[day.top_action] ?? day.top_action}` : ''
  }`;

  return <Tooltip title={label} placement="top" arrow>{cell}</Tooltip>;
};
