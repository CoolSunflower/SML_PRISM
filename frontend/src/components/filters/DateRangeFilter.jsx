import { useMemo } from 'react';
import { useFilterStore } from '../../store/filterStore';

const MAX_RANGE_DAYS = 30;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().substring(0, 10);
}

export function DateRangeFilter() {
  const draft = useFilterStore((s) => s.draft);
  const setDraftDateRange = useFilterStore((s) => s.setDraftDateRange);

  const today = useMemo(() => new Date().toISOString().substring(0, 10), []);

  // Constrain end date: at most MAX_RANGE_DAYS after start, never beyond today
  const endMax = draft.startDate
    ? [addDays(draft.startDate, MAX_RANGE_DAYS), today].sort()[0]
    : today;

  // Constrain start date: at most MAX_RANGE_DAYS before end
  const startMin = draft.endDate ? addDays(draft.endDate, -MAX_RANGE_DAYS) : undefined;

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
        Date Range <span className="font-normal normal-case">(max 30 days)</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={draft.startDate}
          min={startMin}
          max={today}
          onChange={(e) => setDraftDateRange(e.target.value, draft.endDate)}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
        <input
          type="date"
          value={draft.endDate}
          min={draft.startDate || undefined}
          max={endMax}
          onChange={(e) => setDraftDateRange(draft.startDate, e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
    </div>
  );
}
