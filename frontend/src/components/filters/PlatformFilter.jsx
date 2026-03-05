import clsx from 'clsx';
import { useFilterStore } from '../../store/filterStore';

const KWATCH_PLATFORMS = [
  { value: 'Twitter', label: 'X (Twitter)' },
  { value: 'Reddit', label: 'Reddit' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'YouTube', label: 'YouTube' },
];

const GA_PLATFORMS = [
  { value: 'google-alerts', label: 'Google Alerts' },
];

function getPlatformsForSource(source) {
  if (source === 'kwatch') return KWATCH_PLATFORMS;
  if (source === 'google-alerts') return GA_PLATFORMS;
  return [...KWATCH_PLATFORMS, ...GA_PLATFORMS];
}

export function PlatformFilter() {
  const source = useFilterStore((s) => s.source);
  const draft = useFilterStore((s) => s.draft);
  const setDraftPlatform = useFilterStore((s) => s.setDraftPlatform);

  const platforms = getPlatformsForSource(source);
  const selected = draft.platform;

  function toggle(value) {
    if (selected.includes(value)) {
      setDraftPlatform(selected.filter((v) => v !== value));
    } else {
      setDraftPlatform([...selected, value]);
    }
  }

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
        Platform
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {platforms.map((p) => {
          const isSelected = selected.includes(p.value);
          return (
            <button
              key={p.value}
              onClick={() => toggle(p.value)}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all text-left',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
