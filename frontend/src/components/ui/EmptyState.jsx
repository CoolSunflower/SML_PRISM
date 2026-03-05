export function EmptyState({ title = 'No Data Found', message = 'Try adjusting your filters or check back later.' }) {
  return (
    <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
      <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600 mb-4 block">inbox</span>
      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">{message}</p>
    </div>
  );
}
