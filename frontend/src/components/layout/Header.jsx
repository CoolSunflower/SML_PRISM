import { useFilterStore } from '../../store/filterStore';
import { Toggle } from './FilterBar';
import { SettingsMenu } from './SettingsMenu';
import prismLogo from '../../../assets/image.png';

export function Header() {
  const { processing, setProcessing } = useFilterStore();

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-8 py-5">
      <div className='flex justify-between'>
        <div className="flex items-center gap-4">
          <div className="w-50 h-10 rounded-xl bg-primary flex items-center justify-center">
            <img src={prismLogo} className="w-full h-full object-cover" alt="PRISM Logo" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">PRISM</h1>
            <p className="text-xs text-slate-400 dark:text-slate-400 font-medium">Platform for Real-time Insights & Social Monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Toggle
            label="View"
            value={processing}
            onChange={setProcessing}
            options={[
              { value: 'processed', label: 'Processed' },
              { value: 'raw', label: 'Raw' },
            ]}
          />
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
          <SettingsMenu />
        </div>
      </div>
    </header>
  );
}
