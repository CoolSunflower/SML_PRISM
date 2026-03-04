import { formatNumber } from '../../utils/formatters';

function SentimentBar({ label, count, total, bgColor }) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        <span className="text-slate-500 dark:text-slate-400 text-xs">
          {formatNumber(count)} <span className="text-slate-400 dark:text-slate-500">({pct}%)</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bgColor}`}
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
    </div>
  );
}

export function SentimentCard({ data }) {
  const sentiment = data?.sentiment;
  if (!sentiment) return null;

  const total = (sentiment.positive || 0) + (sentiment.neutral || 0) + (sentiment.negative || 0);

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Sentiment</p>
      <div className="space-y-4">
        <SentimentBar
          label="Positive"
          count={sentiment.positive || 0}
          total={total}
          bgColor="bg-emerald-500"
        />
        <SentimentBar
          label="Neutral"
          count={sentiment.neutral || 0}
          total={total}
          bgColor="bg-slate-400"
        />
        <SentimentBar
          label="Negative"
          count={sentiment.negative || 0}
          total={total}
          bgColor="bg-rose-500"
        />
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-center">
        <span className="text-xs text-slate-400 dark:text-slate-500">{formatNumber(total)} total analyzed</span>
      </div>
    </div>
  );
}
