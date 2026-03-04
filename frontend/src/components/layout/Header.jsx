import { useFilterStore } from '../../store/filterStore';
import { Toggle } from './FilterBar';

export function Header() {
  const { processing, setProcessing } = useFilterStore();

  return (
    <header className="bg-white border-b border-slate-200 px-8 py-5">
      <div className='flex justify-between'>
        <div className="flex items-center gap-4">
          <div className="w-50 h-10 rounded-xl bg-primary flex items-center justify-center">
            <img src="../../../assets/image.png" className="w-full h-full object-cover" alt="PRISM Logo" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">PRISM</h1>
            <p className="text-xs text-slate-400 font-medium">Platform for Real-time Insights & Social Monitoring</p>
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
        </div>
      </div>
    </header>
  );
}
