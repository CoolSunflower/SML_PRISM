import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import clsx from 'clsx';
import { useFilterStore } from '../../store/filterStore';
import { formatNumber } from '../../utils/formatters';

const dayOptions = [7, 14, 30];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-700">{label}</p>
      <p className="text-primary font-bold">{formatNumber(payload[0].value)} mentions</p>
    </div>
  );
}

export function PostsChart({ data }) {
  const { chartDays, setChartDays } = useFilterStore();

  const chartData = useMemo(() => {
    if (!data?.dailyCounts) return [];

    const end = new Date();
    const start = subDays(end, chartDays - 1);
    const days = eachDayOfInterval({ start, end });

    return days.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      return {
        date: format(day, 'MMM d'),
        count: data.dailyCounts[key] || 0,
      };
    });
  }, [data, chartDays]);

  const totalInPeriod = data?.totalInPeriod ?? 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Mentions</p>
          <p className="text-3xl font-extrabold text-slate-900">{formatNumber(totalInPeriod)}</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {dayOptions.map((d) => (
            <button
              key={d}
              onClick={() => setChartDays(d)}
              className={clsx(
                'px-3 py-1 text-xs font-semibold rounded-md transition-all',
                chartDays === d
                  ? 'bg-white shadow-sm text-slate-900'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(23, 23, 207, 0.05)' }} />
            <Bar dataKey="count" fill="#1717cf" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
