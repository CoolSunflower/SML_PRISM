const path = require('path');
process.env.HF_HOME = path.join(__dirname, '.hf-cache');
process.env.TRANSFORMERS_CACHE = path.join(__dirname, '.hf-cache');

require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Import routes and services
const routes = require('./routes');
const { startQueueProcessor } = require('./services/kwatchQueue');
const workerPool = require('./services/classificationWorkerPool');
const { startGoogleAlertsScraper, stopGoogleAlertsScraper } = require('./services/googleAlertsService');
const analyticsService = require('./services/analyticsService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', routes);

// SRS Route
app.get('/srs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/SRS.html'), (err) => {
    if (err) {
      res.status(500).send('SRS file not found. Please deploy SRS file to /public/SRS.html.');
    }
  });
});

// SDD Route
app.get('/sdd', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/SDD.html'), (err) => {
    if (err) {
      res.status(500).send('SDD file not found. Please deploy SDD file to /public/SDD.html.');
    }
  });
});

// SPA catch-all: serve index.html for all non-API, non-static routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'), (err) => {
    if (err) {
      res.status(500).send('Frontend not found. Run "npm run build:frontend" to build the UI.');
    }
  });
});

// Initialize worker pool and start server
async function startServer() {
  // Initialize Classification Worker Pool
  // Workers load brand classifier + relevancy classifier internally
  console.log('[Server] Initializing Classification Worker Pool...');
  try {
    await workerPool.initialize();
    const poolMetrics = workerPool.getMetrics();
    console.log(`[Server] Worker Pool ready (${poolMetrics.workerCount} workers)`);
  } catch (err) {
    console.error('[Server] Worker Pool initialization failed:', err.message);
    console.log('[Server] Continuing without classification workers');
  }

  // Initialize Analytics (load from Cosmos DB — runs once at startup)
  console.log('[Server] Loading analytics data...');
  try {
    await analyticsService.initialize();
    console.log('[Server] Analytics data loaded');
  } catch (err) {
    console.error('[Server] Analytics initialization failed:', err.message);
    console.log('[Server] Continuing without cached analytics');
  }

  // Start queue processor for KWatch
  startQueueProcessor();
  console.log('[Server] KWatch queue processor started');

  // // Start Google Alerts RSS scraper (runs every 2 hours, initial scrape on startup)
  // startGoogleAlertsScraper();
  // console.log('[Server] Google Alerts scraper started');

  app.listen(PORT, () => {
    const poolMetrics = workerPool.getMetrics();
    console.log(`Server running on port ${PORT}`);
    console.log(`Classification Workers: ${poolMetrics.initialized ? 'Ready' : 'Not Ready'} (${poolMetrics.workerCount} workers)`);
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');
  stopGoogleAlertsScraper();
  await workerPool.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down...');
  stopGoogleAlertsScraper();
  await workerPool.shutdown();
  process.exit(0);
});

startServer().catch(err => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
