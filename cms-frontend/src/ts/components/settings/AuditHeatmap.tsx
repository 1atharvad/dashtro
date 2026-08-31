import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { API_BASE_URL } from '@ts/config';
import { authFetch } from '@ts/utils/auth';
import { MONTH_LABELS } from '@ts/data/content';
import type { HeatmapDay } from './heatmap';
import { YearHeatmapGrid, type YearGrid } from './YearHeatmapGrid';
import { MonthHeatmapGrid } from './MonthHeatmapGrid';
import { HeatmapLegend } from './HeatmapLegend';
import { HeatmapControls, type HeatmapViewMode } from './HeatmapControls';

/** When projectId is given, the heatmap only counts that project's activity. */
export const AuditHeatmap = ({ projectId }: { projectId?: string } = {}) => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [viewMode, setViewMode] = useState<HeatmapViewMode>('year');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<HeatmapDay[]>([]);
  const [loading, setLoading] = useState(false);

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
      if (projectId) params.set('project_id', projectId);
      const res = await authFetch(`${API_BASE_URL}/audit-logs/heatmap/?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [year, month, viewMode, projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const max = useMemo(() => Math.max(...data.map(d => d.count), 1), [data]);
  const totalPeriod = useMemo(() => data.reduce((s, d) => s + d.count, 0), [data]);

  // ── Year view ───────────────────────────────────────────────────────────────
  const yearGrid: YearGrid | null = useMemo(() => {
    if (viewMode !== 'year' || data.length === 0) return null;

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
      <HeatmapControls
        viewMode={viewMode}
        year={year}
        years={years}
        month={month}
        loading={loading}
        totalPeriod={totalPeriod}
        onViewModeChange={setViewMode}
        onYearChange={setYear}
        onMonthChange={setMonth}
      />

      <Box sx={{ overflowX: 'auto', pb: 1 }}>
        {viewMode === 'year' && yearGrid && <YearHeatmapGrid grid={yearGrid} max={max} />}
        {viewMode === 'month' && monthGrid && <MonthHeatmapGrid grid={monthGrid} max={max} />}
      </Box>

      <HeatmapLegend />
    </Box>
  );
};
