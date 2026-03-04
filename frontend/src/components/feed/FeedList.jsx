import { useFilterStore } from '../../store/filterStore';
import { FeedCard } from './FeedCard';
import { Pagination } from '../ui/Pagination';
import { Spinner } from '../ui/Spinner';
import { EmptyState } from '../ui/EmptyState';

export function FeedList({ items, pagination, loading }) {
  const { processing, page, setPage } = useFilterStore();
  const isProcessed = processing === 'processed';

  if (loading) return <Spinner />;
  if (!items || items.length === 0) return <EmptyState />;

  return (
    <div>
      <div className="space-y-3">
        {items.map((item, idx) => (
          <FeedCard key={item.id || idx} item={item} isProcessed={isProcessed} />
        ))}
      </div>
      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            totalPages={pagination.totalPages}
            totalItems={pagination.totalItems}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
