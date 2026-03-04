const express = require('express');
const router = express.Router();
const { kwatchContainer, kwatchProcessedContainer } = require('../config/database');
const { getQueueStatus } = require('../services/kwatchQueue');

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
    
    // Get total count
    const countQuery = { query: 'SELECT VALUE COUNT(1) FROM c' };
    const { resources: countResult } = await kwatchContainer.items.query(countQuery).fetchAll();
    const totalItems = countResult[0] || 0;

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
      conditions.push('c.classifiedAt >= @startDate');
      parameters.push({ name: '@startDate', value: req.query.startDate });
    }
    if (req.query.endDate) {
      // Add 1 day so the end date is inclusive
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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';

    const querySpec = {
      query: `SELECT * FROM c ${whereClause}ORDER BY c.classifiedAt DESC OFFSET @offset LIMIT @limit`,
      parameters,
    };

    const { resources: items } = await kwatchProcessedContainer.items.query(querySpec).fetchAll();

    // Count query with same filters
    const countParams = parameters.filter(p => p.name !== '@offset' && p.name !== '@limit');
    const countQuery = {
      query: `SELECT VALUE COUNT(1) FROM c ${whereClause}`,
      parameters: countParams,
    };
    const { resources: countResult } = await kwatchProcessedContainer.items.query(countQuery).fetchAll();
    const totalItems = countResult[0] || 0;

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
