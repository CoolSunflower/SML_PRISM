import { fetchJSON } from './client';

export function getAnalytics(source = 'all', view = 'raw', days = 7, startDate = '', endDate = '') {
  const params = new URLSearchParams({ source, view, days });
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  return fetchJSON(`/analytics?${params}`);
}

export function getTopics() {
  return fetchJSON('/filters/topics');
}
