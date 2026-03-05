import { fetchJSON } from './client';

export function getCombinedFeed({
  page = 1,
  limit = 25,
  processing = 'processed',
  startDate,
  endDate,
  topic,
  subTopic,
  platform,
  sentiment,
} = {}) {
  const params = new URLSearchParams({ page, limit, processing });
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  if (topic) params.append('topic', topic);
  if (subTopic) params.append('subTopic', subTopic);
  if (platform?.length > 0) params.append('platform', platform.join(','));
  if (sentiment?.length > 0) params.append('sentiment', sentiment.join(','));
  return fetchJSON(`/feed/combined?${params}`);
}
