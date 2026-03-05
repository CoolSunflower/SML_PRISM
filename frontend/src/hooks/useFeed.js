import { useState, useEffect, useCallback } from 'react';
import { useFilterStore } from '../store/filterStore';
import * as kwatchApi from '../api/kwatch';
import * as gaApi from '../api/googleAlerts';
import * as feedApi from '../api/feed';

export function useFeed() {
  const { source, processing, page, limit, applied, fetchTrigger } = useFilterStore();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = { page, limit, ...applied };

      if (source === 'all') {
        const res = await feedApi.getCombinedFeed({ page, limit, processing, ...applied });
        setItems(res.items);
        setPagination(res.pagination);
      } else if (source === 'kwatch') {
        const res = processing === 'raw'
          ? await kwatchApi.getKWatchRaw(page, limit)
          : await kwatchApi.getKWatchProcessed(filters);
        setItems(res.items.map((i) => ({ ...i, _source: 'kwatch' })));
        setPagination(res.pagination);
      } else {
        const res = processing === 'raw'
          ? await gaApi.getGoogleAlertsRaw(page, limit)
          : await gaApi.getGoogleAlertsProcessed(filters);
        setItems(res.items.map((i) => ({ ...i, _source: 'google-alerts' })));
        setPagination(res.pagination);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, processing, page, limit, fetchTrigger]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  return { items, pagination, loading, error, refetch: fetchFeed };
}
