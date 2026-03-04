'use strict';

const express = require('express');
const router = express.Router();

const {
  googleAlertsRawContainer,
  googleAlertsProcessedContainer,
  googleAlertsStateContainer,
} = require('../config/database');
const { scrapeAllFeeds, getScraperStatus } = require('../services/googleAlertsService');
const analyticsService = require('../services/analyticsService');

// GET /api/google-alerts - Paginated raw data
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.scrapedAt DESC OFFSET @offset LIMIT @limit',
      parameters: [
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ],
    };

    const { resources: items } = await googleAlertsRawContainer.items.query(querySpec).fetchAll();

    // Use cached analytics count instead of expensive COUNT query
    const cached = analyticsService.getAnalytics('google-alerts', 'raw', 30);
    const totalItems = cached?.totalAllTime ?? 0;

    res.json({
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (err) {
    console.error('[GoogleAlerts] Error fetching raw items:', err);
    res.status(500).json({ error: 'Failed to fetch Google Alerts raw items' });
  }
});

// GET /api/google-alerts/processed - Paginated processed/classified data
// Optional filters: startDate, endDate, topic, subTopic
router.get('/processed', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause from optional filter params
    const conditions = [];
    const parameters = [
      { name: '@offset', value: offset },
      { name: '@limit', value: limit },
    ];

    if (req.query.startDate) {
      conditions.push('c.classifiedAt >= @startDate');
      parameters.push({ name: '@startDate', value: req.query.startDate });
    }
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push('c.classifiedAt < @endDate');
      parameters.push({ name: '@endDate', value: end.toISOString() });
    }
    if (req.query.topic) {
      conditions.push('c.topic = @topic');
      parameters.push({ name: '@topic', value: req.query.topic });
    }
    if (req.query.subTopic) {
      conditions.push('c.subTopic = @subTopic');
      parameters.push({ name: '@subTopic', value: req.query.subTopic });
    }

    const hasFilters = conditions.length > 0;
    const whereClause = hasFilters ? `WHERE ${conditions.join(' AND ')} ` : '';

    const querySpec = {
      query: `SELECT * FROM c ${whereClause}ORDER BY c.classifiedAt DESC OFFSET @offset LIMIT @limit`,
      parameters,
    };

    const { resources: items } = await googleAlertsProcessedContainer.items.query(querySpec).fetchAll();

    let totalItems;
    if (hasFilters) {
      // Only run COUNT query when filters are active (unavoidable)
      const countParams = parameters.filter(p => p.name !== '@offset' && p.name !== '@limit');
      const countQuery = {
        query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`,
        parameters: countParams,
      };
      const { resources: countResult } = await googleAlertsProcessedContainer.items
        .query(countQuery)
        .fetchAll();
      totalItems = countResult[0] || 0;
    } else {
      // Use cached analytics count for unfiltered queries
      const cached = analyticsService.getAnalytics('google-alerts', 'processed', 30);
      totalItems = cached?.totalAllTime ?? 0;
    }

    res.json({
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (err) {
    console.error('[GoogleAlerts] Error fetching processed items:', err);
    res.status(500).json({ error: 'Failed to fetch Google Alerts processed items' });
  }
});

// GET /api/google-alerts/state - All feed states (last scraped times, hashes, entry counts)
router.get('/state', async (req, res) => {
  try {
    const { resources } = await googleAlertsStateContainer.items
      .query('SELECT * FROM c ORDER BY c.lastScrapedAt DESC')
      .fetchAll();

    res.json({
      feeds: resources,
      scraperStatus: getScraperStatus(),
    });
  } catch (err) {
    console.error('[GoogleAlerts] Error fetching state:', err);
    res.status(500).json({ error: 'Failed to fetch Google Alerts state' });
  }
});

// POST /api/google-alerts/trigger - Manually trigger a scrape cycle (async, returns immediately)
router.post('/trigger', (req, res) => {
  const status = getScraperStatus();
  if (status.isRunning) {
    return res.status(409).json({ message: 'A scrape cycle is already in progress', status });
  }
  // Fire-and-forget
  scrapeAllFeeds().catch(err =>
    console.error('[GoogleAlerts] Manual trigger error:', err.message)
  );
  res.json({ message: 'Scrape cycle triggered', status: getScraperStatus() });
});

// DELETE /api/google-alerts/:id - Delete a raw item by id
// Partition key for GoogleAlertsRawData is /id, so pass id as both item id and partition key
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await googleAlertsRawContainer.item(id, id).delete();
    res.json({ message: 'Item deleted successfully', id });
  } catch (err) {
    if (err.code === 404) {
      return res.status(404).json({ error: 'Item not found', id: req.params.id });
    }
    console.error('[GoogleAlerts] Error deleting item:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
