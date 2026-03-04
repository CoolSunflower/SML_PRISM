import { useState, useEffect, useCallback } from 'react';
import { useFilterStore } from '../store/filterStore';
import * as kwatchApi from '../api/kwatch';
import * as gaApi from '../api/googleAlerts';
import { mergeFeeds } from '../utils/mergeFeeds';

export function useFeed() {
  const { source, processing, page, limit, startDate, endDate, topic, subTopic } = useFilterStore();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = { page, limit, startDate, endDate, topic, subTopic };

      if (source === 'all') {
        const [kw, ga] = await Promise.all([
          processing === 'raw'
            ? kwatchApi.getKWatchRaw(page, limit)
            : kwatchApi.getKWatchProcessed(filters),
          processing === 'raw'
            ? gaApi.getGoogleAlertsRaw(page, limit)
            : gaApi.getGoogleAlertsProcessed(filters),
        ]);
        const merged = mergeFeeds(kw, ga, processing);
        setItems(merged.items);
        setPagination(merged.pagination);
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
  }, [source, processing, page, limit, startDate, endDate, topic, subTopic]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  return { items, pagination, loading, error, refetch: fetchFeed };
}
