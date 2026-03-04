import { formatNumber } from '../../utils/formatters';

export function MethodSplitCard({ data }) {
  const method = data?.classificationMethod;
  if (!method) return null;

  const brandQuery = method.brandQuery || 0;
  const relevancy = method.relevancyClassification || 0;
  const total = brandQuery + relevancy;
  const bqPct = total > 0 ? ((brandQuery / total) * 100).toFixed(1) : 0;
  const rcPct = total > 0 ? ((relevancy / total) * 100).toFixed(1) : 0;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">
        Classification Method
      </p>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">search</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Brand Query</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Rule-based matching</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatNumber(brandQuery)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{bqPct}%</p>
          </div>
        </div>

        <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${bqPct}%` }}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">psychology</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Relevancy Classification</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">ML-based (SBERT + SVM)</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900 dark:text-white">{formatNumber(relevancy)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{rcPct}%</p>
          </div>
        </div>

        <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
          <div
            className="h-full bg-purple-500 rounded-full transition-all duration-500"
            style={{ width: `${rcPct}%` }}
          />
        </div>

      </div>
    </div>
  );
}
