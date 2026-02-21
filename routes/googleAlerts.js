'use strict';

const express = require('express');
const router = express.Router();

const {
  googleAlertsRawContainer,
  googleAlertsProcessedContainer,
  googleAlertsStateContainer,
} = require('../config/database');
const { scrapeAllFeeds, getScraperStatus } = require('../services/googleAlertsService');

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

    const { resources: countResult } = await googleAlertsRawContainer.items
      .query('SELECT VALUE COUNT(1) FROM c')
      .fetchAll();
    const totalItems = countResult[0] || 0;

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
router.get('/processed', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.classifiedAt DESC OFFSET @offset LIMIT @limit',
      parameters: [
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ],
    };

    const { resources: items } = await googleAlertsProcessedContainer.items.query(querySpec).fetchAll();

    const { resources: countResult } = await googleAlertsProcessedContainer.items
      .query('SELECT VALUE COUNT(1) FROM c')
      .fetchAll();
    const totalItems = countResult[0] || 0;

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
