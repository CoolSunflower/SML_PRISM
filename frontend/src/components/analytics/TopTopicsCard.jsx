import { formatNumber } from '../../utils/formatters';

export function TopTopicsCard({ data }) {
  const topics = data?.topTopics;
  if (!topics || topics.length === 0) return null;

  const maxCount = topics[0]?.count || 1;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Top Topics</p>
      <div className="space-y-3">
        {topics.slice(0, 8).map((t, i) => (
          <div key={t.topic} className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300 dark:text-slate-600 w-4 text-right">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{t.topic}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-2 shrink-0">{formatNumber(t.count)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all duration-500"
                  style={{ width: `${(t.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
