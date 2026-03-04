import { useState, useEffect, useCallback } from 'react';
import { useFilterStore } from '../store/filterStore';
import * as analyticsApi from '../api/analytics';

export function useAnalytics() {
  const { source, processing, chartDays, startDate, endDate } = useFilterStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsApi.getAnalytics(source, processing, chartDays, startDate, endDate);
      setData(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [source, processing, chartDays, startDate, endDate]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
