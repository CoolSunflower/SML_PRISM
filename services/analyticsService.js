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

//  Memoization cache for filtered DB queries
const filterCache = new Map();

function invalidateFilterCache() {
  filterCache.clear();
}

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

  // 2) Per-item fields for last 30 days (aggregates only, no per-item storage)
  const fields = isProcessed
    ? `c.${dateField}, c.topic, c.sentiment`
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
      const sent = (item.sentiment || '').toLowerCase();
      if (sent in target.sentiment) {
        target.sentiment[sent]++;
      }

      if (item.topic) {
        target.topicCounts.set(item.topic, (target.topicCounts.get(item.topic) || 0) + 1);
        target.classificationMethod[inferMethod(item.topic)]++;
      }
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

  invalidateFilterCache();
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

  invalidateFilterCache();
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

//  Filtered analytics via Cosmos DB

/**
 * Resolve the correct container and date field for a source+view combination.
 */
function resolveContainer(sourceKey, view) {
  if (sourceKey === 'kwatch') {
    return {
      container: view === 'processed' ? kwatchProcessedContainer : kwatchContainer,
      dateField: 'receivedAt',
    };
  }
  return {
    container: view === 'processed' ? googleAlertsProcessedContainer : googleAlertsRawContainer,
    dateField: view === 'processed' ? 'classifiedAt' : 'scrapedAt',
  };
}

/**
 * Query Cosmos DB with the given filters, fetch lightweight records,
 * and aggregate in Node.js. Results are memoized until new data arrives.
 */
async function getFilteredAnalyticsFromDB(sourceKey, view, filters) {
  const cacheKey = JSON.stringify({ sourceKey, view, ...filters });
  if (filterCache.has(cacheKey)) {
    return filterCache.get(cacheKey);
  }

  const { startDate, endDate, topic, subTopic, platform, sentiment } = filters;
  const { container, dateField } = resolveContainer(sourceKey, view);

  // ---- Build WHERE clause ----
  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push(`c.${dateField} >= @startDate`);
    params.push({ name: '@startDate', value: startDate });
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    conditions.push(`c.${dateField} < @endDate`);
    params.push({ name: '@endDate', value: end.toISOString() });
  }

  if (view === 'processed') {
    if (topic) {
      conditions.push('c.topic = @topic');
      params.push({ name: '@topic', value: topic });
    }
    if (subTopic) {
      conditions.push('c.subTopic = @subTopic');
      params.push({ name: '@subTopic', value: subTopic });
    }
    if (platform && platform.length > 0) {
      const placeholders = platform.map((_, i) => `@plat${i}`).join(', ');
      // KWatch uses NOT IN (exclusion), Google Alerts uses IN (inclusion)
      conditions.push(
        sourceKey === 'kwatch'
          ? `c.platform NOT IN (${placeholders})`
          : `c.platform IN (${placeholders})`
      );
      platform.forEach((p, i) => params.push({ name: `@plat${i}`, value: p }));
    }
    if (sentiment && sentiment.length > 0) {
      const placeholders = sentiment.map((_, i) => `@sent${i}`).join(', ');
      conditions.push(`c.sentiment IN (${placeholders})`);
      sentiment.forEach((s, i) => {
        // Google Alerts capitalizes sentiment values
        const val = sourceKey === 'kwatch' ? s : s.charAt(0).toUpperCase() + s.slice(1);
        params.push({ name: `@sent${i}`, value: val });
      });
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';

  // ---- Fetch lightweight records ----
  const selectFields = view === 'processed'
    ? `c.${dateField} as dateVal, c.topic, c.sentiment`
    : `c.${dateField} as dateVal`;

  const { resources } = await container.items
    .query({ query: `SELECT ${selectFields} FROM c ${where}`, parameters: params })
    .fetchAll();

  // ---- Aggregate in Node.js ----
  const dailyCounts = {};
  let totalInPeriod = 0;
  const sentimentAgg = { positive: 0, neutral: 0, negative: 0 };
  const topicCounts = new Map();
  const methodAgg = { brandQuery: 0, relevancyClassification: 0 };

  for (const item of resources) {
    const dateKey = toDateKey(item.dateVal);
    if (dateKey) {
      dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
    }
    totalInPeriod++;

    if (view === 'processed') {
      const sent = (item.sentiment || '').toLowerCase();
      if (sent in sentimentAgg) sentimentAgg[sent]++;

      if (item.topic) {
        topicCounts.set(item.topic, (topicCounts.get(item.topic) || 0) + 1);
        methodAgg[inferMethod(item.topic)]++;
      }
    }
  }

  const target = state[sourceKey]?.[view];

  const result = {
    totalInPeriod,
    totalAllTime: target?.totalCount ?? 0,
    dailyCounts,
  };

  if (view === 'processed') {
    result.sentiment = sentimentAgg;
    result.topTopics = [...topicCounts.entries()]
      .map(([t, count]) => ({ topic: t, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    result.classificationMethod = methodAgg;
  }

  filterCache.set(cacheKey, result);
  return result;
}

//  Merge helpers

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
 * Public analytics getter (async).
 *
 * - No filters → fast path using in-memory pre-aggregated Maps (instant)
 * - With filters → queries Cosmos DB, aggregates, memoizes
 */
async function getAnalytics(source, view, days, filters = {}) {
  const f = typeof filters === 'object' && !Array.isArray(filters) ? filters : {};

  const hasGranularFilters =
    f.startDate || f.endDate ||
    f.topic || f.subTopic ||
    (f.platform && f.platform.length > 0) ||
    (f.sentiment && f.sentiment.length > 0);

  if (source === 'all') {
    let kw, ga;

    if (hasGranularFilters) {
      [kw, ga] = await Promise.all([
        getFilteredAnalyticsFromDB('kwatch', view, f),
        getFilteredAnalyticsFromDB('googleAlerts', view, f),
      ]);
    } else {
      kw = getAnalyticsForSource('kwatch', view, days, f.startDate, f.endDate);
      ga = getAnalyticsForSource('googleAlerts', view, days, f.startDate, f.endDate);
    }

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

  if (hasGranularFilters) {
    return getFilteredAnalyticsFromDB(sourceKey, view, f);
  }

  return getAnalyticsForSource(sourceKey, view, days, f.startDate, f.endDate);
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
