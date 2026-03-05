import clsx from 'clsx';
import { useFilterStore } from '../../store/filterStore';

export function Toggle({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{label}:</span>
      <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
              value === opt.value
                ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FilterBar() {
  const { source, setSource, processing, setProcessing, filtersOpen, toggleFilters, applied } = useFilterStore();

  // Count active applied filters
  let badgeCount = 0;
  if (applied.startDate || applied.endDate) badgeCount++;
  if (applied.topic) badgeCount++;
  if (applied.platform.length > 0) badgeCount++;
  if (applied.sentiment.length > 0) badgeCount++;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl mb-6 shadow-sm">
      <Toggle
        label="Source"
        value={source}
        onChange={setSource}
        options={[
          { value: 'all', label: 'All' },
          { value: 'google-alerts', label: 'Google Alerts' },
          { value: 'kwatch', label: 'Social Media' },
        ]}
      />
      <div className="flex items-center gap-4">
        {processing === 'processed' && (
          <>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
            <button
              onClick={toggleFilters}
              className={clsx(
                'relative flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium transition-all',
                filtersOpen
                  ? 'border-primary bg-primary/5 text-primary dark:bg-primary/10'
                  : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300',
              )}
            >
              <span className="material-symbols-outlined text-lg">filter_list</span>
              Filters
              {badgeCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-primary text-white text-[10px] font-bold px-1">
                  {badgeCount}
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
