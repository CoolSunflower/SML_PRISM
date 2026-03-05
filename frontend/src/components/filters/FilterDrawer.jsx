import { useFilterStore } from '../../store/filterStore';
import { DateRangeFilter } from './DateRangeFilter';
import { TopicFilter } from './TopicFilter';
import { PlatformFilter } from './PlatformFilter';
import { SentimentFilter } from './SentimentFilter';

export function FilterDrawer() {
  const filtersOpen = useFilterStore((s) => s.filtersOpen);
  const toggleFilters = useFilterStore((s) => s.toggleFilters);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const applyFilters = useFilterStore((s) => s.applyFilters);
  const draft = useFilterStore((s) => s.draft);
  const applied = useFilterStore((s) => s.applied);
  const source = useFilterStore((s) => s.source);

  if (!filtersOpen) return null;

  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied);
  const hasAnyDraft =
    draft.startDate || draft.endDate || draft.topic || draft.subTopic ||
    draft.platform.length > 0 || draft.sentiment.length > 0;

  console.log(source);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6 shadow-sm animate-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Filters</h3>
        <button
          onClick={toggleFilters}
          className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-lg">close</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 mb-5">
        <DateRangeFilter />
        <TopicFilter />
        {source !== 'google-alerts' && <PlatformFilter />}
        <SentimentFilter />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
        {hasAnyDraft && (
          <button
            onClick={clearFilters}
            className="px-4 py-2 text-sm font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 transition-colors"
          >
            Clear All
          </button>
        )}
        <button
          onClick={() => { applyFilters(); }}
          disabled={!isDirty}
          className="px-5 py-2 text-sm font-semibold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-white hover:bg-primary/90 shadow-sm"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
}
