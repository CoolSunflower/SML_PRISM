import clsx from 'clsx';
import { useFilterStore } from '../../store/filterStore';

const SENTIMENTS = [
  { value: 'positive', label: 'Positive', color: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600' },
  { value: 'neutral', label: 'Neutral', color: 'border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500' },
  { value: 'negative', label: 'Negative', color: 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-600' },
];

export function SentimentFilter() {
  const draft = useFilterStore((s) => s.draft);
  const setDraftSentiment = useFilterStore((s) => s.setDraftSentiment);

  const selected = draft.sentiment;

  function toggle(value) {
    if (selected.includes(value)) {
      setDraftSentiment(selected.filter((v) => v !== value));
    } else {
      setDraftSentiment([...selected, value]);
    }
  }

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
        Sentiment
      </label>
      <div className="flex gap-2">
        {SENTIMENTS.map((s) => {
          const isSelected = selected.includes(s.value);
          return (
            <button
              key={s.value}
              onClick={() => toggle(s.value)}
              className={clsx(
                'flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all',
                isSelected
                  ? s.color
                  : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700',
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
