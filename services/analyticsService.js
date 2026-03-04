'use strict';

const {
  kwatchContainer,
  kwatchProcessedContainer,
  googleAlertsRawContainer,
  googleAlertsProcessedContainer,
} = require('../config/database');

// ─── In-memory analytics state ───────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Startup load ────────────────────────────────────────────────────────────

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
    ? `c.${dateField}, c.topic, c.subTopic, c.sentiment`
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
    }
  }
}

async function initialize() {
  console.log('[Analytics] Loading analytics data from Cosmos DB...');
  const start = Date.now();

  try {
    await Promise.all([
      loadContainerAnalytics(kwatchContainer, 'receivedAt', state.kwatch.raw, false),
      loadContainerAnalytics(kwatchProcessedContainer, 'classifiedAt', state.kwatch.processed, true),
      loadContainerAnalytics(googleAlertsRawContainer, 'scrapedAt', state.googleAlerts.raw, false),
      loadContainerAnalytics(googleAlertsProcessedContainer, 'classifiedAt', state.googleAlerts.processed, true),
    ]);

    state.lastRefreshAt = new Date().toISOString();
    const elapsed = Date.now() - start;
    console.log(`[Analytics] Loaded in ${elapsed}ms — KWatch raw: ${state.kwatch.raw.totalCount}, processed: ${state.kwatch.processed.totalCount} | GA raw: ${state.googleAlerts.raw.totalCount}, processed: ${state.googleAlerts.processed.totalCount}`);
  } catch (err) {
    console.error('[Analytics] Initialization error:', err.message);
    throw err;
  }

  // Schedule daily pruning of data older than 30 days from daily counts
  setInterval(pruneOldData, 24 * 60 * 60 * 1000);
}

// ─── Incremental updates ────────────────────────────────────────────────────

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

  const dateKey = toDateKey(item.classifiedAt);
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
}

// ─── Pruning ─────────────────────────────────────────────────────────────────

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

// ─── Getters ─────────────────────────────────────────────────────────────────

function getAnalyticsForSource(source, view, days) {
  const target = state[source]?.[view];
  if (!target) return null;

  const cutoffKey = cutoffISO(days).substring(0, 10);
  const dailyCounts = {};
  let periodTotal = 0;

  for (const [dateKey, count] of target.dailyCounts) {
    if (dateKey >= cutoffKey) {
      dailyCounts[dateKey] = count;
      periodTotal += count;
    }
  }

  const result = {
    totalInPeriod: periodTotal,
    totalAllTime: target.totalCount,
    dailyCounts,
  };

  // Processed-only fields
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

function getAnalytics(source, view, days) {
  if (source === 'all') {
    const kw = getAnalyticsForSource('kwatch', view, days);
    const ga = getAnalyticsForSource('googleAlerts', view, days);
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
  return getAnalyticsForSource(sourceKey, view, days);
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
