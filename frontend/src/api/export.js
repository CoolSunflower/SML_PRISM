import { fetchJSON } from './client';

/**
 * Fetch a single batch of export data from the backend.
 *
 * @param {object} params
 * @param {'kwatch'|'google-alerts'} params.dataType
 * @param {string} params.startDate       e.g. "2025-01-01"
 * @param {string} params.endDate         e.g. "2025-01-15"
 * @param {string} [params.topic]
 * @param {string} [params.subTopic]
 * @param {string[]} [params.platform]
 * @param {string[]} [params.sentiment]
 * @param {string} [params.remediationStatus]  'accepted' | 'rejected' | 'pending' | ''
 * @param {number} [params.offset]        row offset for pagination (default 0)
 * @param {number} [params.limit]         batch size (default 100)
 * @returns {Promise<{ items: object[], hasMore: boolean, totalCount?: number }>}
 */
export function getExportBatch({
  dataType,
  startDate,
  endDate,
  topic,
  subTopic,
  platform,
  sentiment,
  remediationStatus,
  offset = 0,
  limit = 100,
} = {}) {
  const params = new URLSearchParams({ dataType, startDate, endDate, offset, limit });
  if (topic) params.append('topic', topic);
  if (subTopic) params.append('subTopic', subTopic);
  if (platform?.length > 0) params.append('platform', platform.join(','));
  if (sentiment?.length > 0) params.append('sentiment', sentiment.join(','));
  if (remediationStatus) params.append('remediationStatus', remediationStatus);
  return fetchJSON(`/export/processed?${params}`);
}
