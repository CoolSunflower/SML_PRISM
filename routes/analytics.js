'use strict';

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analyticsService');

// GET /api/analytics?source=all|kwatch|google-alerts&view=raw|processed&days=7|14|30
//   Optional filters: startDate, endDate, topic, subTopic, platform (csv), sentiment (csv)
router.get('/', (req, res) => {
  try {
    const source = req.query.source || 'all';
    const view = req.query.view || 'raw';
    const days = parseInt(req.query.days) || 7;

    // Validate params
    if (!['all', 'kwatch', 'google-alerts'].includes(source)) {
      return res.status(400).json({ error: 'Invalid source. Use: all, kwatch, google-alerts' });
    }
    if (!['raw', 'processed'].includes(view)) {
      return res.status(400).json({ error: 'Invalid view. Use: raw, processed' });
    }
    if (![7, 14, 30].includes(days)) {
      return res.status(400).json({ error: 'Invalid days. Use: 7, 14, 30' });
    }

    // Build filters object
    const filters = {
      startDate: req.query.startDate || '',
      endDate: req.query.endDate || '',
      topic: req.query.topic || '',
      subTopic: req.query.subTopic || '',
      platform: req.query.platform ? req.query.platform.split(',') : [],
      sentiment: req.query.sentiment ? req.query.sentiment.split(',') : [],
    };

    const data = analyticsService.getAnalytics(source, view, days, filters);

    if (!data) {
      return res.status(500).json({ error: 'Analytics data not available' });
    }

    res.json({
      success: true,
      source,
      view,
      days,
      data,
      lastRefreshAt: analyticsService.getLastRefreshAt(),
    });
  } catch (err) {
    console.error('[Analytics] Error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve analytics' });
  }
});

module.exports = router;
