'use strict';

const express = require('express');
const router = express.Router();
const {
  kwatchProcessedContainer,
  googleAlertsProcessedContainer,
} = require('../config/database');

// GET /api/export/processed
// Returns a batch of processed data using SQL OFFSET/LIMIT pagination.
// Required: dataType (kwatch | google-alerts), startDate, endDate
// Optional: topic, subTopic, platform (csv), sentiment (csv), offset (default 0), limit (default 100)
router.get('/processed', async (req, res) => {
  try {
    const {
      dataType,
      startDate,
      endDate,
      topic,
      subTopic,
      platform,
      sentiment,
    } = req.query;
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);

    // Validation
    if (!dataType || !['kwatch', 'google-alerts'].includes(dataType)) {
      return res.status(400).json({ error: 'dataType must be "kwatch" or "google-alerts"' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
    if (daysDiff < 0) {
      return res.status(400).json({ error: 'startDate must be before or equal to endDate' });
    }
    if (daysDiff > 30) {
      return res.status(400).json({ error: 'Date range cannot exceed 30 days' });
    }

    // Container + date field
    const isKWatch = dataType === 'kwatch';
    const container = isKWatch ? kwatchProcessedContainer : googleAlertsProcessedContainer;
    const dateField = isKWatch ? 'c.receivedAt' : 'c.classifiedAt';

    // Build WHERE clause (mirrors routes/kwatch.js and routes/googleAlerts.js patterns)
    const conditions = [];
    const parameters = [];

    // Date range (required, always present)
    conditions.push(`${dateField} >= @startDate`);
    parameters.push({ name: '@startDate', value: startDate });

    const end = new Date(endDate);
    end.setDate(end.getDate() + 1);
    conditions.push(`${dateField} < @endDate`);
    parameters.push({ name: '@endDate', value: end.toISOString() });

    if (topic) {
      conditions.push('c.topic = @topic');
      parameters.push({ name: '@topic', value: topic });
    }
    if (subTopic) {
      conditions.push('c.subTopic = @subTopic');
      parameters.push({ name: '@subTopic', value: subTopic });
    }
    if (platform) {
      const platforms = platform.split(',');
      const placeholders = platforms.map((_, i) => `@plat${i}`).join(', ');
      conditions.push(`c.platform IN (${placeholders})`);
      platforms.forEach((p, i) => parameters.push({ name: `@plat${i}`, value: p }));
    }
    if (sentiment) {
      const sentiments = sentiment.split(',');
      const placeholders = sentiments.map((_, i) => `@sent${i}`).join(', ');
      conditions.push(`c.sentiment IN (${placeholders})`);
      sentiments.forEach((s, i) => {
        // Google Alerts stores sentiment capitalised (e.g. "Positive"); kwatch lowercased
        const val = isKWatch ? s : s.charAt(0).toUpperCase() + s.slice(1);
        parameters.push({ name: `@sent${i}`, value: val });
      });
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // SELECT specific columns only (avoid SELECT * for export performance)
    const selectClause = isKWatch
      ? 'SELECT c.receivedAt, c.platform, c.author, c.title, c.content, c.sentiment, c.topic, c.subTopic, c.link, c.relevantByModel, c.isDuplicate'
      : 'SELECT c.classifiedAt, c.platform, c.title, c.content, c.sentiment, c.topic, c.subTopic, c.extractedUrl, c.relevantByModel';

    // Use SQL OFFSET/LIMIT for stateless batch pagination
    const querySpec = {
      query: `${selectClause} FROM c ${whereClause} ORDER BY ${dateField} DESC OFFSET @offset LIMIT @limit`,
      parameters: [
        ...parameters,
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ],
    };

    const { resources: items } = await container.items.query(querySpec).fetchAll();

    const result = {
      items,
      hasMore: items.length === limit,
    };

    // On first request (offset 0), also return totalCount for progress calculation
    if (offset === 0) {
      const countQuery = {
        query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`,
        parameters,
      };
      const { resources: countResult } = await container.items.query(countQuery).fetchAll();
      result.totalCount = countResult[0] || 0;
    }

    res.json(result);
  } catch (error) {
    console.error('[Export] Error fetching export data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;
