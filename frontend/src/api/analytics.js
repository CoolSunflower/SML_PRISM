import { fetchJSON } from './client';

export function getAnalytics(source = 'all', view = 'raw', days = 7, filters = {}) {
  const params = new URLSearchParams({ source, view, days });
  if (filters.startDate) params.append('startDate', filters.startDate);
  if (filters.endDate) params.append('endDate', filters.endDate);
  if (filters.topic) params.append('topic', filters.topic);
  if (filters.subTopic) params.append('subTopic', filters.subTopic);
  if (filters.platform?.length > 0) params.append('platform', filters.platform.join(','));
  if (filters.sentiment?.length > 0) params.append('sentiment', filters.sentiment.join(','));
  return fetchJSON(`/analytics?${params}`);
}

export function getTopics() {
  return fetchJSON('/filters/topics');
}
