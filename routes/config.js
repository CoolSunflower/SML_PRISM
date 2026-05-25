'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Config file paths
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const BRAND_QUERIES_PATH = path.join(CONFIG_DIR, 'BrandQueries.csv');
const RSS_FEEDS_PATH = path.join(CONFIG_DIR, 'alerts_rss_feeds.json');
const NOT_WEBSITES_PATH = path.join(CONFIG_DIR, 'alerts_not_websites.json');
const NOT_WORDS_PATH = path.join(CONFIG_DIR, 'alerts_not_words.json');

// ============================================================================
// Brand Queries (CSV)
// ============================================================================

/**
 * Parse BrandQueries.csv into JSON array
 * Format: Topic,Sub topic,Query name,Internal ID,Query
 */
function parseBrandQueriesCSV(csvContent) {
  const rows = [];
  const lines = csvContent.split('\n');
  let headers = null;
  let currentRow = null;
  let inQuotedField = false;
  let currentField = '';
  let fieldIndex = 0;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    if (!headers) {
      headers = ['topic', 'subTopic', 'queryName', 'internalId', 'query'];
      continue;
    }

    if (!currentRow) {
      currentRow = {};
      currentField = '';
      fieldIndex = 0;
      inQuotedField = false;
    }

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const nextCh = line[i + 1];

      if (inQuotedField) {
        if (ch === '"' && nextCh === '"') {
          currentField += '"';
          i++; // Skip next quote
        } else if (ch === '"') {
          inQuotedField = false;
        } else {
          currentField += ch;
        }
      } else {
        if (ch === '"' && currentField === '') {
          inQuotedField = true;
        } else if (ch === ',') {
          if (fieldIndex < headers.length) {
            currentRow[headers[fieldIndex]] = currentField.trim();
          }
          currentField = '';
          fieldIndex++;
        } else {
          currentField += ch;
        }
      }
    }

    if (inQuotedField) {
      currentField += '\n';
    } else {
      if (fieldIndex < headers.length) {
        currentRow[headers[fieldIndex]] = currentField.trim();
      }
      // Only push if it has at least the topic
      if (Object.keys(currentRow).length > 0 && currentRow.topic) {
        rows.push(currentRow);
      }
      currentRow = null;
      currentField = '';
      fieldIndex = 0;
    }
  }

  return rows;
}

/**
 * Convert JSON array back to CSV
 */
function buildBrandQueriesCSV(queries) {
  const header = 'Topic,Sub topic,Query name,Internal ID,Query';
  const rows = queries.map(q => {
    // Escape fields that contain commas or quotes
    const escapeField = (val) => {
      if (!val) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    return [
      escapeField(q.topic),
      escapeField(q.subTopic),
      escapeField(q.queryName),
      escapeField(q.internalId),
      escapeField(q.query),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

router.get('/brand-queries', (req, res) => {
  try {
    const csvContent = fs.readFileSync(BRAND_QUERIES_PATH, 'utf-8');
    const queries = parseBrandQueriesCSV(csvContent);
    res.json({ success: true, queries });
  } catch (error) {
    console.error('[Config] Error reading brand queries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/brand-queries', async (req, res) => {
  try {
    console.log('[Config] Received request to update brand queries');

    const { queries } = req.body;
    if (!Array.isArray(queries)) {
      return res.status(400).json({ success: false, error: 'queries must be an array' });
    }

    // Build CSV
    const csvContent = buildBrandQueriesCSV(queries);

    // Write to file
    fs.writeFileSync(BRAND_QUERIES_PATH, csvContent, 'utf-8');

    // Hot-reload: trigger brand classifier and filters to reload
    const brandClassifier = require('../services/brandClassifier');
    const filtersModule = require('./filters');
    const classificationWorkerPool = require('../services/classificationWorkerPool');

    // Reload in main process
    await brandClassifier.reloadQueries();

    // Reload in worker pool
    try {
      await classificationWorkerPool.reloadWorkers();
    } catch (workerErr) {
      console.warn('[Config] Worker pool reload failed:', workerErr.message);
      // Continue anyway - main process reload succeeded
    }

    // Reload filters (topic dropdown)
    if (filtersModule.reloadTopics) {
      filtersModule.reloadTopics();
    }

    console.log('[Config] Brand queries updated and reloaded (main + workers)');
    res.json({ success: true, message: 'Brand queries updated' });
  } catch (error) {
    console.error('[Config] Error updating brand queries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/brand-queries', async (req, res) => {
  try {
    console.log('[Config] Received request to patch brand queries');
    const { additions = [], updates = [], deletions = [] } = req.body;

    const csvContent = fs.readFileSync(BRAND_QUERIES_PATH, 'utf-8');
    let queries = parseBrandQueriesCSV(csvContent);

    // deletions: array of internalIds
    if (deletions.length > 0) {
      queries = queries.filter(q => !deletions.includes(q.internalId));
    }

    // updates: array of { originalInternalId, updatedData }
    if (updates.length > 0) {
      updates.forEach(u => {
        const idx = queries.findIndex(q => q.internalId === u.originalInternalId);
        if (idx !== -1) {
          // Keep existing properties if any, but overwrite with updatedData (minus tracking data)
          const newRow = { ...u.updatedData };
          delete newRow._tid;
          queries[idx] = newRow;
        }
      });
    }

    // additions: array of query objects
    if (additions.length > 0) {
      additions.forEach(a => {
        const newRow = { ...a };
        delete newRow._tid;
        queries.push(newRow);
      });
    }

    // Build CSV
    const newCsvContent = buildBrandQueriesCSV(queries);

    // Write to file
    fs.writeFileSync(BRAND_QUERIES_PATH, newCsvContent, 'utf-8');

    // Hot-reload
    const brandClassifier = require('../services/brandClassifier');
    const filtersModule = require('./filters');
    const classificationWorkerPool = require('../services/classificationWorkerPool');

    await brandClassifier.reloadQueries();
    try {
      await classificationWorkerPool.reloadWorkers();
    } catch (workerErr) {}
    if (filtersModule.reloadTopics) {
      filtersModule.reloadTopics();
    }

    console.log(`[Config] Brand queries patched (Added: ${additions.length}, Updated: ${updates.length}, Deleted: ${deletions.length})`);
    res.json({ success: true, message: 'Brand queries patched' });
  } catch (error) {
    console.error('[Config] Error patching brand queries:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// RSS Feeds (JSON object)
// ============================================================================

router.get('/alerts-rss-feeds', (req, res) => {
  try {
    const feeds = JSON.parse(fs.readFileSync(RSS_FEEDS_PATH, 'utf-8'));
    res.json({ success: true, feeds });
  } catch (error) {
    console.error('[Config] Error reading RSS feeds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/alerts-rss-feeds', (req, res) => {
  try {
    const { feeds } = req.body;
    if (typeof feeds !== 'object' || Array.isArray(feeds)) {
      return res.status(400).json({ success: false, error: 'feeds must be an object' });
    }

    // Write to file
    fs.writeFileSync(RSS_FEEDS_PATH, JSON.stringify(feeds, null, 2), 'utf-8');

    // Hot-reload: trigger Google Alerts service reload
    const googleAlertsService = require('../services/googleAlertsService');
    if (googleAlertsService.reloadConfig) {
      googleAlertsService.reloadConfig();
    }

    console.log('[Config] RSS feeds updated and reloaded');
    res.json({ success: true, message: 'RSS feeds updated' });
  } catch (error) {
    console.error('[Config] Error updating RSS feeds:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Blocked Websites (JSON array)
// ============================================================================

router.get('/alerts-not-websites', (req, res) => {
  try {
    const websites = JSON.parse(fs.readFileSync(NOT_WEBSITES_PATH, 'utf-8'));
    res.json({ success: true, websites });
  } catch (error) {
    console.error('[Config] Error reading blocked websites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/alerts-not-websites', (req, res) => {
  try {
    const { websites } = req.body;
    if (!Array.isArray(websites)) {
      return res.status(400).json({ success: false, error: 'websites must be an array' });
    }

    // Write to file
    fs.writeFileSync(NOT_WEBSITES_PATH, JSON.stringify(websites, null, 2), 'utf-8');

    // Hot-reload: trigger Google Alerts service reload
    const googleAlertsService = require('../services/googleAlertsService');
    if (googleAlertsService.reloadConfig) {
      googleAlertsService.reloadConfig();
    }

    console.log('[Config] Blocked websites updated and reloaded');
    res.json({ success: true, message: 'Blocked websites updated' });
  } catch (error) {
    console.error('[Config] Error updating blocked websites:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// Blocked Words (JSON array)
// ============================================================================

router.get('/alerts-not-words', (req, res) => {
  try {
    const words = JSON.parse(fs.readFileSync(NOT_WORDS_PATH, 'utf-8'));
    res.json({ success: true, words });
  } catch (error) {
    console.error('[Config] Error reading blocked words:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/alerts-not-words', (req, res) => {
  try {
    const { words } = req.body;
    if (!Array.isArray(words)) {
      return res.status(400).json({ success: false, error: 'words must be an array' });
    }

    // Write to file
    fs.writeFileSync(NOT_WORDS_PATH, JSON.stringify(words, null, 2), 'utf-8');

    // Hot-reload: trigger Google Alerts service reload
    const googleAlertsService = require('../services/googleAlertsService');
    if (googleAlertsService.reloadConfig) {
      googleAlertsService.reloadConfig();
    }

    console.log('[Config] Blocked words updated and reloaded');
    res.json({ success: true, message: 'Blocked words updated' });
  } catch (error) {
    console.error('[Config] Error updating blocked words:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
