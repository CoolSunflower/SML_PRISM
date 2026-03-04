import { fetchJSON } from './client';

export function getAnalytics(source = 'all', view = 'raw', days = 7) {
  return fetchJSON(`/analytics?source=${source}&view=${view}&days=${days}`);
}

export function getTopics() {
  return fetchJSON('/filters/topics');
}
