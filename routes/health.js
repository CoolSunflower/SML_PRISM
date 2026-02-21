const express = require('express');
const router = express.Router();
const { getQueueStatus } = require('../services/kwatchQueue');
const workerPool = require('../services/classificationWorkerPool');
const { getScraperStatus } = require('../services/googleAlertsService');

// GET /api/health - Health check
router.get('/', (req, res) => {
  const queueStatus = getQueueStatus();
  const workerMetrics = workerPool.getMetrics();
  const googleAlertsStatus = getScraperStatus();

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      kwatchQueue: queueStatus,
      workerPool: workerMetrics,
      googleAlerts: googleAlertsStatus,
    },
  });
});

module.exports = router;
