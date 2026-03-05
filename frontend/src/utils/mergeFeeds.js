/**
 * Merge KWatch and Google Alerts responses into a single sorted feed.
 */
export function mergeFeeds(kwatchRes, gaRes, processing) {
  const getDate = (item, src) => {
    if (processing === 'processed') return item.classifiedAt || item.receivedAt;
    return src === 'kwatch' ? item.receivedAt : item.scrapedAt;
  };

  const kwItems = (kwatchRes.items || []).map((i) => ({
    ...i,
    _source: 'kwatch',
    _sortDate: getDate(i, 'kwatch'),
  }));

  const gaItems = (gaRes.items || []).map((i) => ({
    ...i,
    _source: 'google-alerts',
    _sortDate: getDate(i, 'google-alerts'),
  }));

  const merged = [...kwItems, ...gaItems].sort(
    (a, b) => new Date(b._sortDate) - new Date(a._sortDate),
  );

  const totalItems =
    (kwatchRes.pagination?.totalItems || 0) + (gaRes.pagination?.totalItems || 0);
  const limit = kwatchRes.pagination?.limit || 25;

  return {
    items: merged,
    pagination: {
      page: kwatchRes.pagination?.page || 1,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}
