export function EmptyState({ title = 'No Data Found', message = 'Try adjusting your filters or check back later.' }) {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
      <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 block">inbox</span>
      <p className="text-lg font-semibold text-slate-700">{title}</p>
      <p className="text-sm text-slate-400 mt-1">{message}</p>
    </div>
  );
}
