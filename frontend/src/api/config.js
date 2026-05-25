import { fetchJSON } from './client';

// ============================================================================
// Brand Queries
// ============================================================================

export function getBrandQueries() {
  return fetchJSON('/config/brand-queries');
}

export function updateBrandQueries(queries) {
  console.log('Updating brand queries (full replace):', queries);
  return fetchJSON('/config/brand-queries', {
    method: 'PUT',
    body: JSON.stringify({ queries }),
  });
}

export function patchBrandQueries(delta) {
  console.log('Patching brand queries:', delta);
  return fetchJSON('/config/brand-queries', {
    method: 'PATCH',
    body: JSON.stringify(delta),
  });
}

// ============================================================================
// RSS Feeds
// ============================================================================

export function getRSSFeeds() {
  return fetchJSON('/config/alerts-rss-feeds');
}

export function updateRSSFeeds(feeds) {
  return fetchJSON('/config/alerts-rss-feeds', {
    method: 'PUT',
    body: JSON.stringify({ feeds }),
  });
}

// ============================================================================
// Blocked Websites
// ============================================================================

export function getBlockedWebsites() {
  return fetchJSON('/config/alerts-not-websites');
}

export function updateBlockedWebsites(websites) {
  return fetchJSON('/config/alerts-not-websites', {
    method: 'PUT',
    body: JSON.stringify({ websites }),
  });
}

// ============================================================================
// Blocked Words
// ============================================================================

export function getBlockedWords() {
  return fetchJSON('/config/alerts-not-words');
}

export function updateBlockedWords(words) {
  return fetchJSON('/config/alerts-not-words', {
    method: 'PUT',
    body: JSON.stringify({ words }),
  });
}
