/**
 * ExportProgress - shown inside ExportModal while a CSV export is in flight.
 * Displays a "do not close" warning, a smooth progress bar, and an optional error message.
 *
 * @param {{ fetched: number, total: number, error: string|null, onCancel: () => void }} props
 */
export function ExportProgress({ fetched, total, error, onCancel }) {
  const percent = total > 0 ? Math.min(Math.round((fetched / total) * 100), 100) : 0;

  return (
    <div className="py-6">
      {/* Warning banner */}
      <div className="flex items-center gap-2 mb-6 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <span className="material-symbols-outlined text-amber-500 text-lg shrink-0">warning</span>
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
          Please do not close this window while the export is in progress.
        </span>
      </div>

      {/* Progress label */}
      <div className="flex justify-between items-baseline text-xs text-slate-500 dark:text-slate-400 mb-1.5">
        <span>Downloading data…</span>
        <span className="tabular-nums">
          {fetched.toLocaleString()} / {total > 0 ? total.toLocaleString() : '—'} rows ({percent}%)
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${total > 0 ? percent : 0}%` }}
        />
      </div>

      {/* Error message */}
      {error && (
        <p className="mt-4 text-sm text-red-500 dark:text-red-400 text-center">{error}</p>
      )}

      {/* Cancel button */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
        >
          Cancel Export
        </button>
      </div>
    </div>
  );
}
