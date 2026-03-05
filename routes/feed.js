'use strict';

const express = require('express');
const router = express.Router();

const {
  kwatchContainer,
  kwatchProcessedContainer,
  googleAlertsRawContainer,
  googleAlertsProcessedContainer,
} = require('../config/database');
const analyticsService = require('../services/analyticsService');
const { getQueueStatus } = require('../services/kwatchQueue');

// GET /api/feed/combined - Combined paginated data from both KWatch and Google Alerts.
//
// For the "All" tab, we cannot paginate each source independently because the
// merged sort order interleaves items from both sources. Fetching page P from
// each source separately can miss items that belong on page P of the combined
// result.
//
// Instead we fetch page*limit items from each source (offset 0), merge by date
// descending, and return the exact slice for the requested page.
router.get('/combined', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const processing = req.query.processing || 'processed';

    // Upper bound of items needed from each source to guarantee the merged
    // result contains every item that belongs in the first P pages.
    const fetchLimit = page * limit;

    if (processing === 'raw') {
      return await handleRaw(req, res, page, limit, fetchLimit);
    }

    return await handleProcessed(req, res, page, limit, fetchLimit);
  } catch (error) {
    console.error('[Feed] Error fetching combined feed:', error);
    res.status(500).json({ error: 'Failed to fetch combined feed' });
  }
});

// ---------------------------------------------------------------------------
// Raw mode: no filters, just paginate by date
// ---------------------------------------------------------------------------
async function handleRaw(req, res, page, limit, fetchLimit) {
  const kwQuery = {
    query: 'SELECT * FROM c ORDER BY c.receivedAt DESC OFFSET 0 LIMIT @fetchLimit',
    parameters: [{ name: '@fetchLimit', value: fetchLimit }],
  };
  const gaQuery = {
    query: 'SELECT * FROM c ORDER BY c.scrapedAt DESC OFFSET 0 LIMIT @fetchLimit',
    parameters: [{ name: '@fetchLimit', value: fetchLimit }],
  };

  const [kwResult, gaResult] = await Promise.all([
    kwatchContainer.items.query(kwQuery).fetchAll(),
    googleAlertsRawContainer.items.query(gaQuery).fetchAll(),
  ]);

  const kwItems = kwResult.resources.map((item) => ({ ...item, _source: 'kwatch' }));
  const gaItems = gaResult.resources.map((item) => ({ ...item, _source: 'google-alerts' }));

  const merged = [...kwItems, ...gaItems].sort((a, b) => {
    const dateA = new Date(a.receivedAt || a.scrapedAt);
    const dateB = new Date(b.receivedAt || b.scrapedAt);
    return dateB - dateA;
  });

  const startIdx = (page - 1) * limit;
  const pageItems = merged.slice(startIdx, startIdx + limit);

  const kwCached = await analyticsService.getAnalytics('kwatch', 'raw', 30);
  const gaCached = await analyticsService.getAnalytics('google-alerts', 'raw', 30);
  const totalItems = (kwCached?.totalAllTime ?? 0) + (gaCached?.totalAllTime ?? 0);

  res.json({
    items: pageItems,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
    queueStatus: getQueueStatus(),
  });
}

// ---------------------------------------------------------------------------
// Processed mode: supports all filter params
// ---------------------------------------------------------------------------
async function handleProcessed(req, res, page, limit, fetchLimit) {
  // ---- KWatch WHERE clause ----
  const kwConditions = [];
  const kwParams = [{ name: '@fetchLimit', value: fetchLimit }];

  if (req.query.startDate) {
    kwConditions.push('c.receivedAt >= @startDate');
    kwParams.push({ name: '@startDate', value: req.query.startDate });
  }
  if (req.query.endDate) {
    const end = new Date(req.query.endDate);
    end.setDate(end.getDate() + 1);
    kwConditions.push('c.receivedAt < @endDate');
    kwParams.push({ name: '@endDate', value: end.toISOString() });
  }
  if (req.query.topic) {
    kwConditions.push('c.topic = @topic');
    kwParams.push({ name: '@topic', value: req.query.topic });
  }
  if (req.query.subTopic) {
    kwConditions.push('c.subTopic = @subTopic');
    kwParams.push({ name: '@subTopic', value: req.query.subTopic });
  }
  if (req.query.platform) {
    const platforms = req.query.platform.split(',');
    const placeholders = platforms.map((_, i) => `@kwPlat${i}`).join(', ');
    kwConditions.push(`c.platform IN (${placeholders})`);
    platforms.forEach((p, i) => kwParams.push({ name: `@kwPlat${i}`, value: p }));
  }
  if (req.query.sentiment) {
    const sentiments = req.query.sentiment.split(',');
    const placeholders = sentiments.map((_, i) => `@kwSent${i}`).join(', ');
    kwConditions.push(`c.sentiment IN (${placeholders})`);
    sentiments.forEach((s, i) => kwParams.push({ name: `@kwSent${i}`, value: s }));
  }

  const kwWhere = kwConditions.length > 0 ? `WHERE ${kwConditions.join(' AND ')} ` : '';

  const kwQuery = {
    query: `SELECT * FROM c ${kwWhere}ORDER BY c.receivedAt DESC OFFSET 0 LIMIT @fetchLimit`,
    parameters: kwParams,
  };

  // ---- Google Alerts WHERE clause ----
  const gaConditions = [];
  const gaParams = [{ name: '@fetchLimit', value: fetchLimit }];

  if (req.query.startDate) {
    gaConditions.push('c.classifiedAt >= @startDate');
    gaParams.push({ name: '@startDate', value: req.query.startDate });
  }
  if (req.query.endDate) {
    const end = new Date(req.query.endDate);
    end.setDate(end.getDate() + 1);
    gaConditions.push('c.classifiedAt < @endDate');
    gaParams.push({ name: '@endDate', value: end.toISOString() });
  }
  if (req.query.topic) {
    gaConditions.push('c.topic = @topic');
    gaParams.push({ name: '@topic', value: req.query.topic });
  }
  if (req.query.subTopic) {
    gaConditions.push('c.subTopic = @subTopic');
    gaParams.push({ name: '@subTopic', value: req.query.subTopic });
  }
  if (req.query.platform) {
    const platforms = req.query.platform.split(',');
    const placeholders = platforms.map((_, i) => `@gaPlat${i}`).join(', ');
    // Google Alerts uses IN (inclusion list) — matches routes/googleAlerts.js line 86
    gaConditions.push(`c.platform IN (${placeholders})`);
    platforms.forEach((p, i) => gaParams.push({ name: `@gaPlat${i}`, value: p }));
  }
  if (req.query.sentiment) {
    const sentiments = req.query.sentiment.split(',');
    const placeholders = sentiments.map((_, i) => `@gaSent${i}`).join(', ');
    gaConditions.push(`c.sentiment IN (${placeholders})`);
    // Google Alerts capitalizes sentiment — matches routes/googleAlerts.js line 94
    sentiments.forEach((s, i) => {
      gaParams.push({ name: `@gaSent${i}`, value: s.charAt(0).toUpperCase() + s.slice(1) });
    });
  }

  const gaWhere = gaConditions.length > 0 ? `WHERE ${gaConditions.join(' AND ')} ` : '';

  const gaQuery = {
    query: `SELECT * FROM c ${gaWhere}ORDER BY c.classifiedAt DESC OFFSET 0 LIMIT @fetchLimit`,
    parameters: gaParams,
  };

  // ---- Fetch items from both sources in parallel ----
  const [kwResult, gaResult] = await Promise.all([
    kwatchProcessedContainer.items.query(kwQuery).fetchAll(),
    googleAlertsProcessedContainer.items.query(gaQuery).fetchAll(),
  ]);

  const kwItems = kwResult.resources.map((item) => ({ ...item, _source: 'kwatch' }));
  const gaItems = gaResult.resources.map((item) => ({ ...item, _source: 'google-alerts' }));

  // Merge by date descending (classifiedAt preferred, fallback to receivedAt)
  const merged = [...kwItems, ...gaItems].sort((a, b) => {
    const dateA = new Date(a.classifiedAt || a.receivedAt);
    const dateB = new Date(b.classifiedAt || b.receivedAt);
    return dateB - dateA;
  });

  // Slice to the requested page
  const startIdx = (page - 1) * limit;
  const pageItems = merged.slice(startIdx, startIdx + limit);

  // ---- Total count ----
  const hasFilters = kwConditions.length > 0;
  let totalItems;

  if (hasFilters) {
    const kwCountParams = kwParams.filter((p) => p.name !== '@fetchLimit');
    const gaCountParams = gaParams.filter((p) => p.name !== '@fetchLimit');

    const [kwCount, gaCount] = await Promise.all([
      kwatchProcessedContainer.items
        .query({ query: `SELECT VALUE COUNT(1) FROM c ${kwWhere}`, parameters: kwCountParams })
        .fetchAll(),
      googleAlertsProcessedContainer.items
        .query({ query: `SELECT VALUE COUNT(1) FROM c ${gaWhere}`, parameters: gaCountParams })
        .fetchAll(),
    ]);

    totalItems = (kwCount.resources[0] || 0) + (gaCount.resources[0] || 0);
  } else {
    const kwCached = await analyticsService.getAnalytics('kwatch', 'processed', 30);
    const gaCached = await analyticsService.getAnalytics('google-alerts', 'processed', 30);
    totalItems = (kwCached?.totalAllTime ?? 0) + (gaCached?.totalAllTime ?? 0);
  }

  res.json({
    items: pageItems,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
    queueStatus: getQueueStatus(),
  });
}

module.exports = router;
