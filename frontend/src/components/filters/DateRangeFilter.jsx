import { useFilterStore } from '../../store/filterStore';

export function DateRangeFilter() {
  const draft = useFilterStore((s) => s.draft);
  const setDraftDateRange = useFilterStore((s) => s.setDraftDateRange);

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
        Date Range
      </label>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={draft.startDate}
          onChange={(e) => setDraftDateRange(e.target.value, draft.endDate)}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
        <input
          type="date"
          value={draft.endDate}
          onChange={(e) => setDraftDateRange(draft.startDate, e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>
    </div>
  );
}
