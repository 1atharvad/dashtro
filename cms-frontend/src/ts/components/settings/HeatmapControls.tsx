import { Box, Typography } from '@mui/material';
import { Select } from 'advi-ui';
import { MONTHS } from '@ts/data/content';

export type HeatmapViewMode = 'year' | 'month';

export const HeatmapControls = ({
  viewMode,
  year,
  years,
  month,
  loading,
  totalPeriod,
  onViewModeChange,
  onYearChange,
  onMonthChange,
}: {
  viewMode: HeatmapViewMode;
  year: number;
  years: number[];
  month: number;
  loading: boolean;
  totalPeriod: number;
  onViewModeChange: (mode: HeatmapViewMode) => void;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
}) => (
  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
    <Select
      value={viewMode}
      onChange={v => onViewModeChange(v as HeatmapViewMode)}
      options={[
        { value: 'year', label: 'Year' },
        { value: 'month', label: 'Month' },
      ]}
    />

    <Select
      value={String(year)}
      onChange={v => onYearChange(Number(v))}
      options={years.map(y => ({ value: String(y), label: String(y) }))}
    />

    {viewMode === 'month' && (
      <Select
        value={String(month)}
        onChange={v => onMonthChange(Number(v))}
        options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
      />
    )}

    <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
      {loading ? 'Loading…' : `${totalPeriod.toLocaleString()} operation${totalPeriod !== 1 ? 's' : ''} this ${viewMode}`}
    </Typography>
  </Box>
);
