'use strict';

const {
  kwatchContainer,
  kwatchProcessedContainer,
  googleAlertsRawContainer,
  googleAlertsProcessedContainer,
} = require('../config/database');

//  In-memory analytics state
const WINDOW_DAYS = 30;

function createEmptyRawState() {
  return { totalCount: 0, dailyCounts: new Map() };
}

function createEmptyProcessedState() {
  return {
    totalCount: 0,
    dailyCounts: new Map(),
    sentiment: { positive: 0, neutral: 0, negative: 0 },
    topicCounts: new Map(),
    classificationMethod: { brandQuery: 0, relevancyClassification: 0 },
    items: [], // Per-item detail for filtered re-aggregation
  };
}

const state = {
  lastRefreshAt: null,
  kwatch: {
    raw: createEmptyRawState(),
    processed: createEmptyProcessedState(),
  },
  googleAlerts: {
    raw: createEmptyRawState(),
    processed: createEmptyProcessedState(),
  },
};

//  Helpers
function toDateKey(isoString) {
  if (!isoString) return null;
  return isoString.substring(0, 10); // YYYY-MM-DD
}

function cutoffISO(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Determine classification method from topic field.
 * Items with topic 'General-RelevancyClassification' were classified by ML model.
 */
function inferMethod(topic) {
  return topic === 'General-RelevancyClassification'
    ? 'relevancyClassification'
    : 'brandQuery';
}

/**
 * Normalize platform strings to canonical form for consistent filtering.
 */
function normalizePlatform(platform) {
  const lower = (platform || '').toLowerCase();
  const map = {
    Twitter: 'Twitter',
    reddit: 'Reddit',
    facebook: 'Facebook',
    youtube: 'YouTube',
    googlealerts: 'google-alerts',
    'google-alerts': 'google-alerts',
  };
  return map[lower] || platform;
}

//  Startup load
async function fetchAllItems(container, querySpec) {
  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources;
}

async function loadContainerAnalytics(container, dateField, target, isProcessed) {
  const cutoff = cutoffISO(WINDOW_DAYS);

  // 1) Total count (all time)
  const [countResult] = await fetchAllItems(container, {
    query: 'SELECT VALUE COUNT(1) FROM c',
  });
  target.totalCount = countResult || 0;

  // 2) Per-item fields for last 30 days
  const fields = isProcessed
    ? `c.${dateField}, c.topic, c.subTopic, c.sentiment, c.platform`
    : `c.${dateField}`;

  const items = await fetchAllItems(container, {
    query: `SELECT ${fields} FROM c WHERE c.${dateField} >= @cutoff`,
    parameters: [{ name: '@cutoff', value: cutoff }],
  });

  for (const item of items) {
    const dateKey = toDateKey(item[dateField]);
    if (dateKey) {
      target.dailyCounts.set(dateKey, (target.dailyCounts.get(dateKey) || 0) + 1);
    }

    if (isProcessed) {
      // Sentiment
      const sent = (item.sentiment || '').toLowerCase();
      if (sent in target.sentiment) {
        target.sentiment[sent]++;
      }

      // Topic
      if (item.topic) {
        target.topicCounts.set(item.topic, (target.topicCounts.get(item.topic) || 0) + 1);
        target.classificationMethod[inferMethod(item.topic)]++;
      }

      // Store lightweight record for filtered re-aggregation
      target.items.push({
        dateKey,
        topic: item.topic || '',
        subTopic: item.subTopic || '',
        sentiment: sent,
        platform: normalizePlatform(item.platform || ''),
        method: inferMethod(item.topic),
      });
    }
  }
}

async function initialize() {
  console.log('[Analytics] Loading analytics data from Cosmos DB...');
  const start = Date.now();

  try {
    await Promise.all([
      loadContainerAnalytics(kwatchContainer, 'receivedAt', state.kwatch.raw, false),
      loadContainerAnalytics(kwatchProcessedContainer, 'receivedAt', state.kwatch.processed, true),
      loadContainerAnalytics(googleAlertsRawContainer, 'scrapedAt', state.googleAlerts.raw, false),
      loadContainerAnalytics(googleAlertsProcessedContainer, 'classifiedAt', state.googleAlerts.processed, true),
    ]);

    state.lastRefreshAt = new Date().toISOString();
    const elapsed = Date.now() - start;
    console.log(`[Analytics] Loaded in ${elapsed}ms - KWatch raw: ${state.kwatch.raw.totalCount}, processed: ${state.kwatch.processed.totalCount} | GA raw: ${state.googleAlerts.raw.totalCount}, processed: ${state.googleAlerts.processed.totalCount}`);
  } catch (err) {
    console.error('[Analytics] Initialization error:', err.message);
    throw err;
  }

  // Schedule daily pruning of data older than 30 days from daily counts
  setInterval(pruneOldData, 24 * 60 * 60 * 1000);
}

//  Incremental updates
function recordRawItem(source, item) {
  const target = state[source]?.raw;
  if (!target) return;

  target.totalCount++;

  const dateField = source === 'kwatch' ? 'receivedAt' : 'scrapedAt';
  const dateKey = toDateKey(item[dateField]);
  if (dateKey) {
    target.dailyCounts.set(dateKey, (target.dailyCounts.get(dateKey) || 0) + 1);
  }
}

function recordProcessedItem(source, item) {
  const target = state[source]?.processed;
  if (!target) return;

  target.totalCount++;

  const dateKey = toDateKey(item.classifiedAt || item.receivedAt);
  if (dateKey) {
    target.dailyCounts.set(dateKey, (target.dailyCounts.get(dateKey) || 0) + 1);
  }

  // Sentiment
  const sent = (item.sentiment || '').toLowerCase();
  if (sent in target.sentiment) {
    target.sentiment[sent]++;
  }

  // Topic + method
  if (item.topic) {
    target.topicCounts.set(item.topic, (target.topicCounts.get(item.topic) || 0) + 1);
    target.classificationMethod[inferMethod(item.topic)]++;
  }

  // Store lightweight record for filtered re-aggregation
  target.items.push({
    dateKey,
    topic: item.topic || '',
    subTopic: item.subTopic || '',
    sentiment: sent,
    platform: normalizePlatform(item.platform || ''),
    method: inferMethod(item.topic),
  });
}

//  Pruning
function pruneOldData() {
  const cutoffKey = cutoffISO(WINDOW_DAYS).substring(0, 10);

  for (const source of ['kwatch', 'googleAlerts']) {
    for (const view of ['raw', 'processed']) {
      const dailyCounts = state[source][view].dailyCounts;
      for (const [dateKey] of dailyCounts) {
        if (dateKey < cutoffKey) {
          dailyCounts.delete(dateKey);
        }
      }
    }
    // Prune per-item detail arrays for processed views
    const proc = state[source].processed;
    proc.items = proc.items.filter((item) => item.dateKey >= cutoffKey);
  }
}

//  Getters
/**
 * Fast path: aggregate-only analytics using pre-computed Maps.
 * Used when no granular filters (platform, sentiment, topic, date) are active.
 */
function getAnalyticsForSource(source, view, days, startDate, endDate) {
  const target = state[source]?.[view];
  if (!target) return null;

  // Determine date range for filtering dailyCounts
  const hasDateFilter = startDate || endDate;
  const startKey = startDate ? startDate.substring(0, 10) : null;
  // endDate is inclusive - add 1 day for comparison
  let endKey = null;
  if (endDate) {
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    endKey = end.toISOString().substring(0, 10);
  }
  const cutoffKey = cutoffISO(days).substring(0, 10);

  const dailyCounts = {};
  let periodTotal = 0;

  for (const [dateKey, count] of target.dailyCounts) {
    // Apply date range filter if present, otherwise use days cutoff
    if (hasDateFilter) {
      if (startKey && dateKey < startKey) continue;
      if (endKey && dateKey >= endKey) continue;
    } else {
      if (dateKey < cutoffKey) continue;
    }
    dailyCounts[dateKey] = count;
    periodTotal += count;
  }

  const result = {
    totalInPeriod: periodTotal,
    totalAllTime: target.totalCount,
    dailyCounts,
  };

  // Processed-only fields (aggregated over full 30-day window)
  if (view === 'processed') {
    result.sentiment = { ...target.sentiment };

    // Top topics sorted by count descending
    result.topTopics = [...target.topicCounts.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    result.classificationMethod = { ...target.classificationMethod };
  }

  return result;
}

/**
 * Filtered analytics: iterate per-item records and re-aggregate.
 * Falls back to fast path when no granular filters are active.
 */
function getFilteredAnalyticsForSource(source, view, days, filters) {
  const { startDate, endDate, topic, subTopic, platform, sentiment } = filters;

  // Raw view does not support granular filters
  if (view !== 'processed') {
    return getAnalyticsForSource(source, view, days, startDate, endDate);
  }

  const hasGranularFilters =
    startDate || endDate ||
    topic || subTopic ||
    (platform && platform.length > 0) ||
    (sentiment && sentiment.length > 0);

  // Fast path: no filters at all - use pre-aggregated Maps (unfiltered 30-day window)
  if (!hasGranularFilters) {
    return getAnalyticsForSource(source, view, days, startDate, endDate);
  }

  const target = state[source]?.processed;
  if (!target) return null;

  // Date bounds
  const hasDateFilter = startDate || endDate;
  const startKey = startDate ? startDate.substring(0, 10) : null;
  let endKey = null;
  if (endDate) {
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    endKey = end.toISOString().substring(0, 10);
  }
  const cutoffKey = cutoffISO(days).substring(0, 10);

  // Build Sets for O(1) lookup on array filters
  const platformSet = platform && platform.length > 0
    ? new Set(platform.map(normalizePlatform))
    : null;
  const sentimentSet = sentiment && sentiment.length > 0
    ? new Set(sentiment.map((s) => s.toLowerCase()))
    : null;

  const dailyCounts = {};
  let periodTotal = 0;
  const sentimentAgg = { positive: 0, neutral: 0, negative: 0 };
  const topicCounts = new Map();
  const methodAgg = { brandQuery: 0, relevancyClassification: 0 };

  for (const item of target.items) {
    // Date filter
    if (hasDateFilter) {
      if (startKey && item.dateKey < startKey) continue;
      if (endKey && item.dateKey >= endKey) continue;
    } else {
      if (item.dateKey < cutoffKey) continue;
    }

    // Granular filters
    if (topic && item.topic !== topic) continue;
    if (subTopic && item.subTopic !== subTopic) continue;
    if (platformSet && !platformSet.has(item.platform)) continue;
    if (sentimentSet && !sentimentSet.has(item.sentiment)) continue;

    // Aggregate
    dailyCounts[item.dateKey] = (dailyCounts[item.dateKey] || 0) + 1;
    periodTotal++;

    if (item.sentiment in sentimentAgg) {
      sentimentAgg[item.sentiment]++;
    }
    if (item.topic) {
      topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
      methodAgg[item.method]++;
    }
  }

  return {
    totalInPeriod: periodTotal,
    totalAllTime: target.totalCount, // all-time remains unfiltered
    dailyCounts,
    sentiment: sentimentAgg,
    topTopics: [...topicCounts.entries()]
      .map(([t, count]) => ({ topic: t, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    classificationMethod: methodAgg,
  };
}

function mergeDailyCounts(a, b) {
  const merged = { ...a };
  for (const [key, val] of Object.entries(b)) {
    merged[key] = (merged[key] || 0) + val;
  }
  return merged;
}

function mergeTopTopics(a, b) {
  const map = new Map();
  for (const item of a) map.set(item.topic, (map.get(item.topic) || 0) + item.count);
  for (const item of b) map.set(item.topic, (map.get(item.topic) || 0) + item.count);
  return [...map.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/**
 * Public analytics getter. Accepts a filters object:
 *   { startDate, endDate, topic, subTopic, platform: string[], sentiment: string[] }
 *
 * Backward-compatible: callers from kwatch/googleAlerts routes pass (source, view, 30)
 * for totalAllTime without a filters object — defaults to empty filters.
 */
function getAnalytics(source, view, days, filters = {}) {
  // Normalize: old callers may pass positional (source, view, days) with no filters
  const f = typeof filters === 'object' && !Array.isArray(filters)
    ? filters
    : {};

  if (source === 'all') {
    const kw = getFilteredAnalyticsForSource('kwatch', view, days, f);
    const ga = getFilteredAnalyticsForSource('googleAlerts', view, days, f);
    if (!kw || !ga) return null;

    const result = {
      totalInPeriod: kw.totalInPeriod + ga.totalInPeriod,
      totalAllTime: kw.totalAllTime + ga.totalAllTime,
      dailyCounts: mergeDailyCounts(kw.dailyCounts, ga.dailyCounts),
    };

    if (view === 'processed') {
      result.sentiment = {
        positive: kw.sentiment.positive + ga.sentiment.positive,
        neutral: kw.sentiment.neutral + ga.sentiment.neutral,
        negative: kw.sentiment.negative + ga.sentiment.negative,
      };
      result.topTopics = mergeTopTopics(kw.topTopics, ga.topTopics);
      result.classificationMethod = {
        brandQuery: kw.classificationMethod.brandQuery + ga.classificationMethod.brandQuery,
        relevancyClassification: kw.classificationMethod.relevancyClassification + ga.classificationMethod.relevancyClassification,
      };
    }

    return result;
  }

  const sourceKey = source === 'google-alerts' ? 'googleAlerts' : source;
  return getFilteredAnalyticsForSource(sourceKey, view, days, f);
}

function getLastRefreshAt() {
  return state.lastRefreshAt;
}

module.exports = {
  initialize,
  recordRawItem,
  recordProcessedItem,
  getAnalytics,
  getLastRefreshAt,
};
