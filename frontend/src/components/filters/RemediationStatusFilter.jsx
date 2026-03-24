import clsx from 'clsx';
import { useFilterStore } from '../../store/filterStore';

const REMEDIATION_STATUSES = [
  { value: '', label: 'All' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'pending', label: 'Pending' },
];

export function RemediationStatusFilter() {
  const draft = useFilterStore((s) => s.draft);
  const setDraftRemediationStatus = useFilterStore((s) => s.setDraftRemediationStatus);

  const selected = draft.remediationStatus;

  return (
    <div>
      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
        Remediation Status
      </label>
      <div className="flex gap-2">
        {REMEDIATION_STATUSES.map((s) => {
          const isSelected = selected === s.value;
          return (
            <button
              key={s.value}
              onClick={() => setDraftRemediationStatus(s.value)}
              className={clsx(
                'flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all',
                isSelected
                  ? 'border-primary bg-primary/10 text-primary'
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
