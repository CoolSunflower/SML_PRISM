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
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
        Classification Method
      </p>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-blue-600">search</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Brand Query</p>
            <p className="text-xs text-slate-400">Rule-based matching</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900">{formatNumber(brandQuery)}</p>
            <p className="text-xs text-slate-400">{bqPct}%</p>
          </div>
        </div>

        <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${bqPct}%` }}
          />
          <div
            className="h-full bg-purple-500 transition-all duration-500"
            style={{ width: `${rcPct}%` }}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-purple-600">psychology</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-700">Relevancy Classification</p>
            <p className="text-xs text-slate-400">ML-based (SBERT + SVM)</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-slate-900">{formatNumber(relevancy)}</p>
            <p className="text-xs text-slate-400">{rcPct}%</p>
          </div>
        </div>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 text-center">
        <span className="text-xs text-slate-400">{formatNumber(total)} total classified</span>
      </div>
    </div>
  );
}
