const express = require('express');
const router = express.Router();
const workerPool = require('../services/classificationWorkerPool');

// POST /api/classify - Classify text using worker pool (brand + relevancy)
router.post('/', (req, res) => {
  const { text, title, content } = req.body;

  // Support both { text } and { title, content } formats
  let textToClassify = text;
  if (!textToClassify && content) {
    textToClassify = `${title || ''} ${content}`;
  }

  if (!textToClassify || typeof textToClassify !== 'string') {
    return res.status(400).json({
      error: 'Missing or invalid "text" field (or "title"/"content" fields) in request body',
    });
  }

  const metrics = workerPool.getMetrics();
  if (!metrics.initialized) {
    return res.status(503).json({
      error: 'Classification workers not initialized',
      message: 'The server is still starting up. Please try again in a moment.',
    });
  }

  // Submit to worker pool and wait for result
  const jobItem = {
    id: 'classify-api-request',
    title: title || '',
    content: textToClassify,
    query: '',
    platform: 'API',
  };

  workerPool.submitJob(jobItem, (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Classification failed', message: err.message });
    }

    res.json({
      matched: result.matched,
      method: result.method,
      classification: result.classification,
      relevantByModel: result.relevantByModel,
      textLength: textToClassify.length,
    });
  });
});

// GET /api/classify/status - Get classifier status (from worker pool)
router.get('/status', (req, res) => {
  const metrics = workerPool.getMetrics();
  res.json({
    initialized: metrics.initialized,
    workerCount: metrics.workerCount,
    workers: metrics.workers,
  });
});

module.exports = router;
