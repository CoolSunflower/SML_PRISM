const express = require('express');
const router = express.Router();
const { getClassifierStatus, getLanguageDetectionStatus, reloadQueries } = require('../services/brandClassifier');
const { getQueueStatus } = require('../services/kwatchQueue');
const { getStatus: getRelevancyStatus } = require('../utils/relevancyClassifier');

// GET /api/health - Health check
router.get('/', (req, res) => {
  const classifierStatus = getClassifierStatus();
  const queueStatus = getQueueStatus();
  const relevancyStatus = getRelevancyStatus();
  const langDetectionStatus = getLanguageDetectionStatus();
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      brandClassifier: {
        initialized: classifierStatus.initialized,
        queryCount: classifierStatus.queryCount,
      },
      relevancyClassifier: {
        initialized: relevancyStatus.initialized,
        threshold: relevancyStatus.config?.threshold || null,
        embeddingModel: relevancyStatus.config?.embeddingModel || null,
      },
      languageDetection: {
        initialized: langDetectionStatus.initialized,
        library: langDetectionStatus.library,
      },
      kwatchQueue: queueStatus,
    },
  });
});

// POST /api/health/reload-classifier - Force reload brand queries
router.post('/reload-classifier', (req, res) => {
  try {
    const result = reloadQueries();
    res.json({
      success: result.success,
      message: result.success 
        ? `Reloaded ${result.queryCount} queries` 
        : `Failed: ${result.error}`,
      details: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
