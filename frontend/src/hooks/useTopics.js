import { useState, useEffect } from 'react';
import { getTopics } from '../api/analytics';

export function useTopics() {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopics()
      .then((res) => setTopics(res.topics || []))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, []);

  return { topics, loading };
}
