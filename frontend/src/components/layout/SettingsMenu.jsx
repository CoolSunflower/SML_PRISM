import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import clsx from 'clsx';

const chartOptions = [
  { value: 'bar', label: 'Bar', icon: 'bar_chart' },
  { value: 'line', label: 'Line', icon: 'show_chart' },
  { value: 'area', label: 'Area', icon: 'area_chart' },
];

export function SettingsMenu() {
  const { theme, chartType, setTheme, setChartType } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'w-9 h-9 flex items-center justify-center rounded-lg border transition-all',
          open
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700',
        )}
      >
        <span className="material-symbols-outlined text-lg">settings</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 z-50">
          {/* Theme */}
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Theme</p>
          <div className="flex gap-1.5 mb-4">
            <button
              onClick={() => setTheme('light')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                theme === 'light'
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
              )}
            >
              <span className="material-symbols-outlined text-sm">light_mode</span>
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                theme === 'dark'
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
              )}
            >
              <span className="material-symbols-outlined text-sm">dark_mode</span>
              Dark
            </button>
          </div>

          {/* Chart Type */}
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Chart Style</p>
          <div className="flex gap-1.5">
            {chartOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChartType(opt.value)}
                className={clsx(
                  'flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-all',
                  chartType === opt.value
                    ? 'bg-primary text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600',
                )}
              >
                <span className="material-symbols-outlined text-base">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
