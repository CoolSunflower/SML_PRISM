import { useMemo } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { format, subDays, eachDayOfInterval } from 'date-fns';
import clsx from 'clsx';
import { useFilterStore } from '../../store/filterStore';
import { useSettingsStore } from '../../store/settingsStore';
import { formatNumber } from '../../utils/formatters';

const dayOptions = [7, 14, 30];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-slate-700 dark:text-slate-200">{label}</p>
      <p className="text-primary font-bold">{formatNumber(payload[0].value)} mentions</p>
    </div>
  );
}

function ChartContent({ chartType, chartData }) {
  const axisProps = {
    tick: { fontSize: 11, fill: '#94a3b8' },
    axisLine: false,
    tickLine: false,
  };

  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#1717cf"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#1717cf' }}
            activeDot={{ r: 5, fill: '#1717cf' }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === 'area') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1717cf" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#1717cf" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#1717cf"
            strokeWidth={2.5}
            fill="url(#colorCount)"
            dot={{ r: 3, fill: '#1717cf' }}
            activeDot={{ r: 5, fill: '#1717cf' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar chart
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
        <XAxis dataKey="date" {...axisProps} />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(23, 23, 207, 0.05)' }} />
        <Bar dataKey="count" fill="#1717cf" radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PostsChart({ data }) {
  const { chartDays, setChartDays, startDate, endDate } = useFilterStore();
  const { chartType } = useSettingsStore();
  const hasDateFilter = startDate || endDate;

  const chartData = useMemo(() => {
    if (!data?.dailyCounts) return [];

    let start, end;
    if (hasDateFilter) {
      // Use date filter range, clamped to available data
      start = startDate ? new Date(startDate) : subDays(new Date(), 29);
      end = endDate ? new Date(endDate) : new Date();
    } else {
      end = new Date();
      start = subDays(end, chartDays - 1);
    }

    const days = eachDayOfInterval({ start, end });

    return days.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      return {
        date: format(day, 'MMM d'),
        count: data.dailyCounts[key] || 0,
      };
    });
  }, [data, chartDays, startDate, endDate, hasDateFilter]);

  const totalInPeriod = data?.totalInPeriod ?? 0;
  const totalAllTime = data?.totalAllTime ?? 0;

  const periodLabel = hasDateFilter ? 'Filtered' : `${chartDays}d`;

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mentions ({periodLabel})</p>
          <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{formatNumber(totalInPeriod)}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {formatNumber(totalAllTime)} all time
          </p>
        </div>
        {!hasDateFilter && (
          <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
            {dayOptions.map((d) => (
              <button
                key={d}
                onClick={() => setChartDays(d)}
                className={clsx(
                  'px-3 py-1 text-xs font-semibold rounded-md transition-all',
                  chartDays === d
                    ? 'bg-white dark:bg-slate-600 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="h-56">
        <ChartContent chartType={chartType} chartData={chartData} />
      </div>
    </div>
  );
}
