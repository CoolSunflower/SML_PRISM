const express = require('express');
const router = express.Router();
const { kwatchContainer, kwatchProcessedContainer } = require('../config/database');
const { getQueueStatus } = require('../services/kwatchQueue');
const analyticsService = require('../services/analyticsService');

// GET /api/kwatch - KWatch Raw Data Retrieval Endpoint
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const querySpec = {
      query: 'SELECT * FROM c ORDER BY c.receivedAt DESC OFFSET @offset LIMIT @limit',
      parameters: [
        { name: '@offset', value: offset },
        { name: '@limit', value: limit }
      ]
    };

    const { resources: items } = await kwatchContainer.items.query(querySpec).fetchAll();

    // Use cached analytics count instead of expensive COUNT query
    const cached = await analyticsService.getAnalytics('kwatch', 'raw', 30);
    const totalItems = cached?.totalAllTime ?? 0;

    res.json({
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit)
      },
      queueStatus: getQueueStatus()
    });
  } catch (error) {
    console.error('Error fetching KWatch items:', error);
    res.status(500).json({ error: 'Failed to fetch KWatch items' });
  }
});

// GET /api/kwatch/processed - KWatch Processed (Classified) Data Retrieval Endpoint
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
      conditions.push('c.receivedAt >= @startDate');
      parameters.push({ name: '@startDate', value: req.query.startDate });
    }
    if (req.query.endDate) {
      // Add 1 day so the end date is inclusive
      const end = new Date(req.query.endDate);
      end.setDate(end.getDate() + 1);
      conditions.push('c.receivedAt < @endDate');
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
    if (req.query.platform) {
      const platforms = req.query.platform.split(',');
      const placeholders = platforms.map((_, i) => `@plat${i}`).join(', ');
      conditions.push(`c.platform NOT IN (${placeholders})`);
      platforms.forEach((p, i) => parameters.push({ name: `@plat${i}`, value: p }));
    }
    if (req.query.sentiment) {
      const sentiments = req.query.sentiment.split(',');
      const placeholders = sentiments.map((_, i) => `@sent${i}`).join(', ');
      conditions.push(`c.sentiment IN (${placeholders})`);
      sentiments.forEach((s, i) => {
        parameters.push({ name: `@sent${i}`, value: s });
      });
    }

    const hasFilters = conditions.length > 0;
    const whereClause = hasFilters ? `WHERE ${conditions.join(' AND ')} ` : '';

    const querySpec = {
      query: `SELECT * FROM c ${whereClause} ORDER BY c.receivedAt DESC OFFSET @offset LIMIT @limit`,
      parameters,
    };

    const { resources: items } = await kwatchProcessedContainer.items.query(querySpec).fetchAll();

    let totalItems;
    if (hasFilters) {
      // Only run COUNT query when filters are active (unavoidable)
      const countParams = parameters.filter(p => p.name !== '@offset' && p.name !== '@limit');
      const countQuery = {
        query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`,
        parameters: countParams,
      };
      const { resources: countResult } = await kwatchProcessedContainer.items.query(countQuery).fetchAll();
      totalItems = countResult[0] || 0;
    } else {
      // Use cached analytics count for unfiltered queries
      const cached = await analyticsService.getAnalytics('kwatch', 'processed', 30);
      totalItems = cached?.totalAllTime ?? 0;
    }

    res.json({
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit)
      },
      queueStatus: getQueueStatus()
    });
  } catch (error) {
    console.error('Error fetching KWatch processed items:', error);
    res.status(500).json({ error: 'Failed to fetch KWatch processed items' });
  }
});

// PATCH /api/kwatch/processed/:id/remediate - Accept or reject a processed KWatch item
router.patch('/processed/:id/remediate', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, platform } = req.body;

    if (!action || !['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'action must be "accepted" or "rejected"' });
    }
    if (!platform) {
      return res.status(400).json({ error: 'platform (partition key) is required' });
    }

    const { resource: existing } = await kwatchProcessedContainer.item(id, [platform, id]).read();
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updated = { ...existing, doneRemediation: true, remediationAction: action };

    if (action === 'accepted') {
      // TODO: send to SharePoint list for downstream reporting & update Cosmos item
      console.log(`[Remediation] KWatch item ${id} accepted: SharePoint send pending implementation`);
      // const { resource: replaced } = await kwatchProcessedContainer.item(id, [platform, id]).replace(updated);
    }

    res.json({ success: true, item: updated });
  } catch (error) {
    if (error.code === 404) {
      return res.status(404).json({ error: 'Item not found' });
    }
    console.error('[Remediation] Error remediating KWatch processed item:', error);
    res.status(500).json({ error: 'Failed to remediate item' });
  }
});

// DELETE /api/kwatch/:id - Delete a KWatch item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { platform } = req.query; // Need partition key for deletion

    if (!platform) {
      return res.status(400).json({ error: 'Platform (partition key) is required' });
    }

    await kwatchContainer.item(id, platform).delete();
    res.json({ message: 'Item deleted successfully', id });
  } catch (error) {
    console.error('Error deleting KWatch item:', error);
    res.status(500).json({ error: 'Failed to delete item', reason: error });
  }
});

module.exports = router;
