import { useState, useCallback } from 'react';
import { useFilterStore } from '../../store/filterStore';
import { FeedCard } from './FeedCard';
import { Pagination } from '../ui/Pagination';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';
import { Toast } from '../ui/Toast';
import { format } from 'date-fns';
import { remediateItem } from '../../api/remediation';

function FeedHeader({ pagination, startDate, endDate }) {
  const totalItems = pagination?.totalItems ?? 0;
  const hasDateFilter = startDate || endDate;

  let rangeLabel;
  if (hasDateFilter) {
    const from = startDate ? format(new Date(startDate), 'MMM d, yyyy') : 'Beginning';
    const to = endDate ? format(new Date(endDate), 'MMM d, yyyy') : 'Now';
    rangeLabel = `${from} - ${to}`;
  } else {
    rangeLabel = 'All time';
  }

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-lg">list</span>
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Feed</h2>
        <span className="text-xs text-slate-400 dark:text-slate-500">({totalItems.toLocaleString()} results)</span>
      </div>
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700 px-3 py-1 rounded-full">
        {rangeLabel}
      </span>
    </div>
  );
}

export function FeedList({ items, pagination, loading }) {
  const { processing, page, limit, applied, setPage } = useFilterStore();
  const { startDate, endDate } = applied;
  const isProcessed = processing === 'processed' || processing === 'relevant';

  // Local overrides applied optimistically after remediation
  const [overrides, setOverrides] = useState({});

  // Toast notification state
  const [toast, setToast] = useState(null);

  const showToast = useCallback(({ message, type = 'info' }) => {
    setToast({ id: Date.now(), message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  async function handleRemediate(id, action, platform, editedFields = {}) {
    const item = items.find(i => i.id === id);
    const source = item?._source === 'google-alerts' ? 'google-alerts' : 'kwatch';

    const response = await remediateItem(source, id, action, platform, editedFields);

    if (response.success && response.item) {
      // Update local state with the response from server
      setOverrides(prev => ({
        ...prev,
        [id]: {
          remediationStatus: response.item.remediationStatus,
          remediatedAt: response.item.remediatedAt,
          // Also update any edited classification fields
          ...(editedFields.sentiment && { sentiment: response.item.sentiment }),
          ...(editedFields.topic && { topic: response.item.topic }),
          ...(editedFields.subTopic && { subTopic: response.item.subTopic }),
        },
      }));
    }

    return response;
  }

  if (loading) return <Spinner />;
  if (!items || items.length === 0) return <EmptyState />;

  const displayItems = Object.keys(overrides).length > 0
    ? items.map(item => overrides[item.id] ? { ...item, ...overrides[item.id] } : item)
    : items;

  return (
    <div>
      <FeedHeader pagination={pagination} startDate={startDate} endDate={endDate} />
      <div className="space-y-3">
        {displayItems.map((item, idx) => (
          <FeedCard
            key={item.id || idx}
            item={item}
            isProcessed={isProcessed}
            onRemediate={isProcessed ? handleRemediate : undefined}
            onShowToast={showToast}
          />
        ))}
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            limit={limit}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={hideToast}
        />
      )}
    </div>
  );
}
