import { useState, useEffect, useRef, useMemo } from 'react';
import clsx from 'clsx';
import { useTopics } from '../../hooks/useTopics';
import { getExportBatch } from '../../api/export';
import { buildCSV, downloadCSV } from '../../utils/csv';
import { ExportProgress } from './ExportProgress';

const MAX_RANGE_DAYS = 30;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().substring(0, 10);
}

const KWATCH_PLATFORMS = [
  { value: 'Twitter', label: 'X (Twitter)' },
  { value: 'Reddit', label: 'Reddit' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'YouTube', label: 'YouTube' },
];

const SENTIMENTS = [
  {
    value: 'positive',
    label: 'Positive',
    active: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600',
  },
  {
    value: 'neutral',
    label: 'Neutral',
    active: 'border-slate-400 bg-slate-50 text-slate-700 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500',
  },
  {
    value: 'negative',
    label: 'Negative',
    active: 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-600',
  },
];

/**
 * ExportModal - full-screen overlay that lets users configure and trigger a CSV export.
 * @param {{ onClose: () => void }} props
 */
export function ExportModal({ onClose }) {
  // Filter state
  const [dataType, setDataType] = useState('kwatch');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [topic, setTopic] = useState('');
  const [subTopic, setSubTopic] = useState('');
  const [platform, setPlatform] = useState([]);
  const [sentiment, setSentiment] = useState([]);

  // Export progress state
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState({ fetched: 0, total: 0 });
  const [error, setError] = useState(null);

  // Abort flag: set to true to break out of the fetch loop
  const abortRef = useRef(false);

  const { topics, loading: topicsLoading } = useTopics();

  const today = useMemo(() => new Date().toISOString().substring(0, 10), []);

  // Date range constraints (mirrors DateRangeFilter.jsx logic)
  const endMax = startDate
    ? [addDays(startDate, MAX_RANGE_DAYS), today].sort()[0]
    : today;
  const startMin = endDate ? addDays(endDate, -MAX_RANGE_DAYS) : undefined;

  // Topic & sub-topics
  const selectedTopicObj = topics.find((t) => t.topic === topic);
  const subTopics = selectedTopicObj?.subTopics || [];

  // Reset subTopic when topic changes
  function handleTopicChange(val) {
    setTopic(val);
    setSubTopic('');
  }

  // Reset platform + subTopic when dataType changes
  function handleDataTypeChange(val) {
    setDataType(val);
    setPlatform([]);
    setSubTopic('');
    setTopic('');
  }

  // Toggle helpers
  function togglePlatform(val) {
    setPlatform((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }
  function toggleSentiment(val) {
    setSentiment((prev) =>
      prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]
    );
  }

  // Warn user before closing the tab/window during export
  useEffect(() => {
    if (!exporting) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [exporting]);

  function handleCancel() {
    abortRef.current = true;
    setExporting(false);
    setError(null);
  }

  const canExport = startDate && endDate && !exporting;

  async function handleExport() {
    abortRef.current = false;
    setExporting(true);
    setError(null);
    setProgress({ fetched: 0, total: 0 });

    try {
      let allItems = [];
      let offset = 0;
      let totalCount = 0;
      let hasMore = true;
      const BATCH_SIZE = 100;

      while (hasMore) {
        if (abortRef.current) break;

        const response = await getExportBatch({
          dataType,
          startDate,
          endDate,
          topic: topic || undefined,
          subTopic: subTopic || undefined,
          platform: platform.length > 0 ? platform : undefined,
          sentiment: sentiment.length > 0 ? sentiment : undefined,
          offset,
          limit: BATCH_SIZE,
        });

        allItems = allItems.concat(response.items);

        if (offset === 0 && response.totalCount != null) {
          totalCount = response.totalCount;
        }

        offset += response.items.length;
        hasMore = response.hasMore;
        setProgress({ fetched: allItems.length, total: totalCount });
      }

      if (abortRef.current) return; // cancelled, don't trigger download

      const csv = buildCSV(allItems, dataType);
      const label = dataType === 'kwatch' ? 'social-media' : 'google-alerts';
      downloadCSV(csv, `prism-export-${label}-${startDate}-to-${endDate}.csv`);

      // Close modal on success
      onClose();
    } catch (err) {
      setError(err.message || 'Export failed. Please try again.');
    } finally {
      if (!abortRef.current) setExporting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={exporting ? undefined : onClose}
      >
        {/* Modal card, stops backdrop click from bubbling through */}
        <div
          className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">download</span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Export Data</h2>
            </div>
            <button
              onClick={exporting ? undefined : onClose}
              disabled={exporting}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {exporting ? (
              <ExportProgress
                fetched={progress.fetched}
                total={progress.total}
                error={error}
                onCancel={handleCancel}
              />
            ) : (
              <div className="space-y-5">
                {/* Page selection (Processed only) */}
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                    Page
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled
                      className="px-4 py-1.5 text-sm font-semibold rounded-lg border border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 cursor-not-allowed opacity-80"
                    >
                      Processed
                    </button>
                    <button
                      disabled
                      className="px-4 py-1.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                      title="Raw data export is not supported due to volume"
                    >
                      Raw (not supported)
                    </button>
                  </div>
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-700" />

                {/* Data type, required */}
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                    Data Type <span className="font-normal normal-case text-red-400">*</span>
                  </p>
                  <div className="flex gap-2">
                    {[
                      { value: 'kwatch', label: 'Social Media', icon: 'groups' },
                      { value: 'google-alerts', label: 'Google Alerts', icon: 'notifications' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleDataTypeChange(opt.value)}
                        className={clsx(
                          'flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border transition-all',
                          dataType === opt.value
                            ? 'border-primary bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300'
                            : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700',
                        )}
                      >
                        <span className="material-symbols-outlined text-base">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-700" />

                {/* Date range, required */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                    Date Range <span className="text-red-400">*</span>{' '}
                    <span className="font-normal normal-case">(max 30 days)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      min={startMin}
                      max={today}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                    <span className="text-xs text-slate-400 dark:text-slate-500">to</span>
                    <input
                      type="date"
                      value={endDate}
                      min={startDate || undefined}
                      max={endMax}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>

                <div className="h-px bg-slate-100 dark:bg-slate-700" />

                {/* Optional filters, 2-column grid */}
                <div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                    Optional Filters
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {/* Topic / Sub-topic */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                        Topic / Sub-topic
                      </label>
                      <div className="space-y-2">
                        <select
                          value={topic}
                          onChange={(e) => handleTopicChange(e.target.value)}
                          disabled={topicsLoading}
                          className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                        >
                          <option value="">All Topics</option>
                          {topics.map((t) => (
                            <option key={t.topic} value={t.topic}>
                              {t.isRelevancyFallback ? 'Relevancy Classified (ML)' : t.topic}
                            </option>
                          ))}
                        </select>
                        {subTopics.length > 0 && (
                          <select
                            value={subTopic}
                            onChange={(e) => setSubTopic(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          >
                            <option value="">All Sub-topics</option>
                            {subTopics.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {/* Sentiment */}
                    <div>
                      <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                        Sentiment
                      </label>
                      <div className="flex gap-2">
                        {SENTIMENTS.map((s) => {
                          const isSelected = sentiment.includes(s.value);
                          return (
                            <button
                              key={s.value}
                              onClick={() => toggleSentiment(s.value)}
                              className={clsx(
                                'flex-1 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all',
                                isSelected
                                  ? s.active
                                  : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700',
                              )}
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Platform (kwatch only) */}
                    {dataType === 'kwatch' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                          Platform
                        </label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {KWATCH_PLATFORMS.map((p) => {
                            const isSelected = platform.includes(p.value);
                            return (
                              <button
                                key={p.value}
                                onClick={() => togglePlatform(p.value)}
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
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!exporting && (
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={!canExport}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span className="material-symbols-outlined text-base">download</span>
                Export CSV
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
