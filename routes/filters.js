'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// ─── Parse BrandQueries.csv at module load ──────────────────────────────────

let topicsHierarchy = [];
let totalQueries = 0;

function loadTopics() {
  try {
    const csvPath = path.join(__dirname, '..', 'config', 'BrandQueries.csv');
    const raw = fs.readFileSync(csvPath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());

    // Skip header row
    const dataLines = lines.slice(1);
    totalQueries = dataLines.length;

    // Build topic -> Set<subTopic> map
    const topicMap = new Map();

    for (const line of dataLines) {
      // CSV may have commas inside quoted fields — simple parse:
      // Columns: Topic, Sub topic, Query name, Internal ID, Query
      // Split on first 4 commas (Query field may contain commas)
      const parts = [];
      let current = '';
      let inQuotes = false;
      let colCount = 0;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes && colCount < 4) {
          parts.push(current.trim());
          current = '';
          colCount++;
        } else {
          current += ch;
        }
      }
      parts.push(current.trim()); // last field

      const topic = parts[0];
      const subTopic = parts[1];

      if (topic) {
        if (!topicMap.has(topic)) {
          topicMap.set(topic, new Set());
        }
        if (subTopic) {
          topicMap.get(topic).add(subTopic);
        }
      }
    }

    // Convert to array format
    topicsHierarchy = [...topicMap.entries()]
      .map(([topic, subTopics]) => ({
        topic,
        subTopics: [...subTopics].sort(),
      }))
      .sort((a, b) => a.topic.localeCompare(b.topic));

    // Add the special ML-classification entry
    topicsHierarchy.push({
      topic: 'General-RelevancyClassification',
      subTopics: [],
      isRelevancyFallback: true,
    });

    console.log(`[Filters] Loaded ${topicsHierarchy.length} topics with ${totalQueries} queries from BrandQueries.csv`);
  } catch (err) {
    console.error('[Filters] Failed to load BrandQueries.csv:', err.message);
  }
}

// Load on module init
loadTopics();

// GET /api/filters/topics
router.get('/topics', (req, res) => {
  res.json({
    success: true,
    topics: topicsHierarchy,
    totalQueries,
  });
});

module.exports = router;
