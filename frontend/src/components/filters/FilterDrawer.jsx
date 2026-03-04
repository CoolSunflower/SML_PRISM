import clsx from 'clsx';
import { useFilterStore } from '../../store/filterStore';
import { DateRangeFilter } from './DateRangeFilter';
import { TopicFilter } from './TopicFilter';

export function FilterDrawer() {
  const { filtersOpen, toggleFilters, clearFilters, startDate, endDate, topic, subTopic } =
    useFilterStore();

  if (!filtersOpen) return null;

  const hasActiveFilters = startDate || endDate || topic || subTopic;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 shadow-sm animate-in slide-in-from-top-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700">Filters</h3>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-rose-500 hover:text-rose-600 font-medium transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={toggleFilters}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 transition-colors"
          >
            <span className="material-symbols-outlined text-slate-400 text-lg">close</span>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DateRangeFilter />
        <TopicFilter />
      </div>
    </div>
  );
}
