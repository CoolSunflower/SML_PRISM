import clsx from 'clsx';

const variants = {
  positive: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  neutral: 'bg-slate-50 text-slate-500 border-slate-200',
  negative: 'bg-rose-50 text-rose-600 border-rose-100',
  info: 'bg-blue-50 text-blue-600 border-blue-100',
  success: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
};

export function Badge({ variant = 'neutral', children, className }) {
  return (
    <span
      className={clsx(
        'px-2 py-0.5 text-[10px] font-bold uppercase rounded border tracking-wider inline-flex items-center',
        variants[variant] || variants.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}
