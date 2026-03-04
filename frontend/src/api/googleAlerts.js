import { fetchJSON } from './client';

export function getGoogleAlertsRaw(page = 1, limit = 25) {
  return fetchJSON(`/google-alerts?page=${page}&limit=${limit}`);
}

export function getGoogleAlertsProcessed({ page = 1, limit = 25, startDate, endDate, topic, subTopic } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (topic) params.append('topic', topic);
  if (subTopic) params.append('subTopic', subTopic);
  return fetchJSON(`/google-alerts/processed?${params}`);
}
