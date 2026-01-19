require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes and services
const routes = require('./routes');
const { startQueueProcessor } = require('./services/kwatchQueue');
const { initializeBrandClassifier, getClassifierStatus } = require('./services/brandClassifier');
const { initializeRelevancyClassifier, getStatus: getRelevancyStatus } = require('./utils/relevancyClassifier');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', routes);

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'), (err) => {
    if (err) {
      res.status(500).send('Frontend not found. Please deploy frontend files to /public folder.');
    }
  });
});

// Initialize classifiers and start server
async function startServer() {
  // Initialize Brand Classifier
  console.log('[Server] Initializing Brand Classifier...');
  const classifierInit = await initializeBrandClassifier();
  if (classifierInit.success) {
    console.log(`[Server] Brand Classifier ready with ${classifierInit.queryCount} queries`);
  } else {
    console.error('[Server] Brand Classifier initialization failed:', classifierInit.error);
  }

  // Initialize Relevancy Classifier (SBERT + SVM model)
  console.log('[Server] Initializing Relevancy Classifier...');
  try {
    await initializeRelevancyClassifier();
    const relevancyStatus = getRelevancyStatus();
    console.log(`[Server] Relevancy Classifier ready (threshold: ${relevancyStatus.config?.threshold?.toFixed(4)})`);
  } catch (err) {
    console.error('[Server] Relevancy Classifier initialization failed:', err.message);
    console.log('[Server] Continuing without relevancy classification fallback');
  }

  // Start queue processor for KWatch
  startQueueProcessor();
  console.log('[Server] KWatch queue processor started');

  app.listen(PORT, () => {
    const brandStatus = getClassifierStatus();
    const relevancyStatus = getRelevancyStatus();
    console.log(`Server running on port ${PORT}`);
    console.log(`Brand Classifier: ${brandStatus.initialized ? 'Ready' : 'Not Ready'} (${brandStatus.queryCount} queries)`);
    console.log(`Relevancy Classifier: ${relevancyStatus.initialized ? 'Ready' : 'Not Ready'}`);
  });
}

startServer().catch(err => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
