import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, MenuItem, Select, Tooltip, Typography, FormControl } from '@mui/material';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { ACTION_LABELS, MONTHS, DAY_LABELS, MONTH_LABELS, HEATMAP_CELL, HEATMAP_GAP, HEATMAP_CELL_MONTH } from '@ts/data/content';

type HeatmapDay = {
  date: string;
  count: number;
  top_action: string | null;
};

type ViewMode = 'year' | 'month';


function getIntensity(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.15) return 1;
  if (ratio <= 0.4) return 2;
  if (ratio <= 0.7) return 3;
  return 4;
}

type CellProps = {
  day: HeatmapDay | null;
  intensity: 0 | 1 | 2 | 3 | 4;
  size?: number;
};

const HeatCell = ({ day, intensity, size = HEATMAP_CELL }: CellProps) => {
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
        cursor: day && day.count > 0 ? 'default' : 'default',
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

type Props = {
  totalOps: number;
};

export const AuditHeatmap = ({ totalOps }: Props) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [viewMode, setViewMode] = useState<ViewMode>('year');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    const y = [];
    for (let i = currentYear; i >= currentYear - 4; i--) y.push(i);
    return y;
  }, [currentYear]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (viewMode === 'month') params.set('month', String(month));
      const res = await authFetch(`${API_BASE_URL}/audit-logs/heatmap/?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month, viewMode]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const max = useMemo(() => Math.max(...data.map(d => d.count), 1), [data]);
  const totalPeriod = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);

  // ── Year view ───────────────────────────────────────────────────────────────
  const yearGrid = useMemo(() => {
    if (viewMode !== 'year' || data.length === 0) return null;

    const byDate: Record<string, HeatmapDay> = {};
    data.forEach(d => { byDate[d.date] = d; });

    // Build week columns: pad from Jan 1's weekday
    const jan1 = new Date(year, 0, 1).getDay(); // 0=Sun
    const weeks: (HeatmapDay | null)[][] = [];
    let week: (HeatmapDay | null)[] = Array(jan1).fill(null);

    data.forEach(d => {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    });
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }

    // Month label positions (which week index does each month start at)
    const monthPositions: { label: string; col: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, col) => {
      const firstReal = w.find(d => d !== null);
      if (firstReal) {
        const m = new Date(firstReal.date).getMonth();
        if (m !== lastMonth) {
          monthPositions.push({ label: MONTH_LABELS[m], col });
          lastMonth = m;
        }
      }
    });

    return { weeks, monthPositions };
  }, [viewMode, data, year]);

  // ── Month view ──────────────────────────────────────────────────────────────
  const monthGrid = useMemo(() => {
    if (viewMode !== 'month' || data.length === 0) return null;

    const firstDay = new Date(year, month - 1, 1).getDay();
    const rows: (HeatmapDay | null)[][] = [];
    let row: (HeatmapDay | null)[] = Array(firstDay).fill(null);

    data.forEach(d => {
      row.push(d);
      if (row.length === 7) { rows.push(row); row = []; }
    });
    if (row.length > 0) {
      while (row.length < 7) row.push(null);
      rows.push(row);
    }
    return rows;
  }, [viewMode, data, year, month]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <Select value={viewMode} onChange={e => setViewMode(e.target.value as ViewMode)}>
            <MenuItem value="year">Year</MenuItem>
            <MenuItem value="month">Month</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 90 }}>
          <Select value={year} onChange={e => setYear(Number(e.target.value))}>
            {years.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
          </Select>
        </FormControl>

        {viewMode === 'month' && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <MenuItem key={i} value={i + 1}>{m}</MenuItem>)}
            </Select>
          </FormControl>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
          {loading ? 'Loading…' : `${totalPeriod.toLocaleString()} operation${totalPeriod !== 1 ? 's' : ''} this ${viewMode}`}
        </Typography>
      </Box>

      {/* Heatmap */}
      <Box ref={containerRef} sx={{ overflowX: 'auto', pb: 1 }}>
        {viewMode === 'year' && yearGrid && (
          <Box sx={{ display: 'inline-flex', flexDirection: 'column', gap: 0, userSelect: 'none' }}>
            {/* Month labels */}
            <Box sx={{ display: 'flex', ml: `${HEATMAP_CELL + HEATMAP_GAP + 4}px`, mb: '4px' }}>
              {yearGrid.monthPositions.map(({ label, col }, i) => {
                const nextCol = yearGrid.monthPositions[i + 1]?.col ?? yearGrid.weeks.length;
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
                {yearGrid.weeks.map((week, wi) => (
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
        )}

        {viewMode === 'month' && monthGrid && (
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
            {monthGrid.map((row, ri) => (
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
        )}
      </Box>

      {/* Legend */}
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
    </Box>
  );
};
