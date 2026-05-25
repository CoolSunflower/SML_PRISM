import { fetchJSON } from './client';

export function getKWatchRaw(page = 1, limit = 25) {
  return fetchJSON(`/kwatch?page=${page}&limit=${limit}`);
}

export function getKWatchProcessed({ page = 1, limit = 25, startDate, endDate, topic, subTopic, platform, sentiment, remediationStatus } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (topic) params.append('topic', topic);
  if (subTopic) params.append('subTopic', subTopic);
  if (platform?.length > 0) params.append('platform', platform.join(','));
  if (sentiment?.length > 0) params.append('sentiment', sentiment.join(','));
  if (remediationStatus) params.append('remediationStatus', remediationStatus);
  return fetchJSON(`/kwatch/processed?${params}`);
}

export function deleteKWatchItem(id, platform) {
  return fetchJSON(`/kwatch/${encodeURIComponent(id)}?platform=${encodeURIComponent(platform)}`, {
    method: 'DELETE',
  });
}
