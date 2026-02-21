const express = require('express');
const router = express.Router();
const { getQueueStatus } = require('../services/kwatchQueue');
const workerPool = require('../services/classificationWorkerPool');

// GET /api/health - Health check
router.get('/', (req, res) => {
  const queueStatus = getQueueStatus();
  const workerMetrics = workerPool.getMetrics();

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      kwatchQueue: queueStatus,
      workerPool: workerMetrics,
    },
  });
});

module.exports = router;
