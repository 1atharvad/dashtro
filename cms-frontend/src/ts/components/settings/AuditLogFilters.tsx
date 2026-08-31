import { Box, FormControl, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { Button } from 'advi-ui';
import { ACTION_LABELS, RESOURCE_TYPES } from '@ts/data/content';

export const AuditLogFilters = ({
  filterAction,
  filterResourceType,
  filterFromDate,
  filterToDate,
  onFilterActionChange,
  onFilterResourceTypeChange,
  onFilterFromDateChange,
  onFilterToDateChange,
  onClear,
}: {
  filterAction: string;
  filterResourceType: string;
  filterFromDate: string;
  filterToDate: string;
  onFilterActionChange: (value: string) => void;
  onFilterResourceTypeChange: (value: string) => void;
  onFilterFromDateChange: (value: string) => void;
  onFilterToDateChange: (value: string) => void;
  onClear: () => void;
}) => {
  const hasFilters = !!(filterAction || filterResourceType || filterFromDate || filterToDate);

  return (
    <Box sx={{ px: 3, pb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <FormControl size="small" sx={{ minWidth: 180 }}>
        <InputLabel>Action</InputLabel>
        <Select value={filterAction} label="Action" onChange={e => onFilterActionChange(e.target.value)}>
          <MenuItem value="">All actions</MenuItem>
          {Object.entries(ACTION_LABELS).map(([val, label]) => (
            <MenuItem key={val} value={val}>{label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel>Resource type</InputLabel>
        <Select value={filterResourceType} label="Resource type" onChange={e => onFilterResourceTypeChange(e.target.value)}>
          <MenuItem value="">All types</MenuItem>
          {RESOURCE_TYPES.map(t => (
            <MenuItem key={t} value={t}>{t.replace('_', ' ')}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        size="small" label="From date" type="date" value={filterFromDate}
        onChange={e => onFilterFromDateChange(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        size="small" label="To date" type="date" value={filterToDate}
        onChange={e => onFilterToDateChange(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />

      {hasFilters && (
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </Box>
  );
};
