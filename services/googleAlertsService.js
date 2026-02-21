'use strict';

const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

// Silence jsdom's CSS parser warnings — they fire on nearly every real-world page
// because jsdom doesn't support modern/vendor-specific CSS. Readability only needs
// the DOM tree, so these warnings are safe to suppress.
const silentVirtualConsole = new VirtualConsole();
silentVirtualConsole.forwardTo(console, { omitJSDOMErrors: true });
const { Readability } = require('@mozilla/readability');
const Parser = require('rss-parser');

const {
  googleAlertsRawContainer,
  googleAlertsProcessedContainer,
  googleAlertsStateContainer,
} = require('../config/database');
const workerPool = require('./classificationWorkerPool');

const RSS_FEEDS = require('../config/alerts_rss_feeds.json');
const NOT_WEBSITES = require('../config/alerts_not_websites.json');

const SCRAPE_INTERVAL = parseInt(process.env.GOOGLE_ALERTS_SCRAPE_INTERVAL) || 7200000; // 2 hours
const FEED_FETCH_CONCURRENCY = 10; // Number of feeds fetched in parallel per batch
const CONTENT_FETCH_TIMEOUT_MS = 10000; // 10 seconds per article fetch

// Scraper state 
let isScrapingInProgress = false;
let lastScrapeAt = null;
let lastScrapeStats = null;
let scraperInterval = null;

// Reusable RSS parser with reasonable timeout and browser-like UA
const rssParser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SMLGoogleAlertsScraper/1.0)' },
  customFields: { item: [['content', 'content']] },
});

// ID helpers
function generateIdFromUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}
function generateStateId(feedName) {
  return crypto.createHash('md5').update(feedName).digest('hex');
}

// URL extraction

/**
 * Extract the real article URL from a Google Alerts redirect link.
 * e.g. https://www.google.com/url?rct=j&sa=t&url=https%3A%2F%2F...&ct=ga&...
 *   → https://...
 */
function extractUrlFromGoogleLink(googleLink) {
  try {
    const parsed = new URL(googleLink);
    // Google Alerts uses the 'url' query parameter for the destination
    const rawUrl = parsed.searchParams.get('url');
    if (!rawUrl) return null;
    // Validate it's a proper URL before returning
    new URL(rawUrl);
    return rawUrl;
  } catch {
    return null;
  }
}

// NOT websites blocklist
/**
 * Returns true if url's hostname matches any entry in NOT_WEBSITES.
 * Matches exact domain and all subdomains:
 *   blocked = "espn.com" → matches "www.espn.com", "video.espn.com"
 */
function isNotWebsite(url) {
  if (NOT_WEBSITES.length === 0) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return NOT_WEBSITES.some(blocked => {
      const b = blocked.toLowerCase().replace(/^\./, '');
      return hostname === b || hostname.endsWith('.' + b);
    });
  } catch {
    return false;
  }
}

// Full article content fetching
/**
 * Attempt to fetch and extract the readable article text from a URL.
 * Uses @mozilla/readability (Firefox Reader View engine) via jsdom.
 * Returns the extracted text string on success, or null on any failure.
 */
async function fetchArticleContent(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONTENT_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();
    const dom = new JSDOM(html, { url, virtualConsole: silentVirtualConsole });
    const article = new Readability(dom.window.document).parse();

    if (!article || !article.textContent) return null;

    const text = article.textContent.replace(/\s+/g, ' ').trim();
    // Only return if we got a meaningful body of text
    return text.length > 100 ? text : null;

  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// State management (Cosmos DB)
/**
 * Bulk-load all feed state documents into a map keyed by state document id.
 * Single cross-partition query, called once per scrape cycle.
 */
async function loadAllFeedStates() {
  try {
    const { resources } = await googleAlertsStateContainer.items
      .query('SELECT * FROM c')
      .fetchAll();

    const stateMap = {};
    for (const doc of resources) {
      stateMap[doc.id] = doc;
    }
    return stateMap;
  } catch (err) {
    console.error('[GoogleAlerts] Failed to load feed states:', err.message);
    return {};
  }
}

/** Upsert the state record for a single feed after scraping it. */
async function saveFeedState(feedName, feedUrl, lastLinkHash, entryCount) {
  const stateDoc = {
    id: generateStateId(feedName),
    feedName,
    feedUrl,
    lastLinkHash,   // null if feed is empty
    lastScrapedAt: new Date().toISOString(),
    entryCount,
  };
  try {
    await googleAlertsStateContainer.items.upsert(stateDoc);
  } catch (err) {
    console.error(`[GoogleAlerts] Failed to save state for "${feedName}":`, err.message);
  }
}

// Single feed scraping

/**
 * Fetch one RSS feed, compare with stored state, and return any new entries
 * as queue items. Updates state in DB. Throws on RSS fetch failure so the
 * caller (scrapeAllFeeds) can count it as a failed feed; state is NOT
 * updated in that case so the feed is retried next cycle.
 */
async function scrapeFeed(feedName, feedUrl, stateMap) {
  // Let RSS fetch errors propagate — caller tracks them as feedsFailed
  const feed = await rssParser.parseURL(feedUrl);

  const entries = feed.items || [];

  if (entries.length === 0) {
    // Empty feed, save state so we don't query state unnecessarily next time
    await saveFeedState(feedName, feedUrl, null, 0);
    return [];
  }

  const topmostLink = entries[0].link || '';
  const topmostHash = crypto.createHash('md5').update(topmostLink).digest('hex');

  const stateId = generateStateId(feedName);
  const existingState = stateMap[stateId];

  // Nothing new if the topmost entry's link hash matches what we stored
  if (existingState && existingState.lastLinkHash === topmostHash) {
    return [];
  }

  // Walk entries newest->oldest; stop at the previously known topmost hash
  const knownHash = existingState ? existingState.lastLinkHash : null;
  const newEntries = [];

  for (const entry of entries) {
    const linkHash = crypto.createHash('md5').update(entry.link || '').digest('hex');

    // Stop as soon as we reach an entry we already processed
    if (knownHash && linkHash === knownHash) break;

    // Strip residual HTML tags from RSS title / content fields
    const cleanTitle = (entry.title || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').trim();
    const rawSnippet = entry.content || entry.contentSnippet || entry.summary || '';
    const cleanSnippet = rawSnippet.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();

    newEntries.push({
      googleLink: entry.link || '',
      keyword: feedName,
      title: cleanTitle,
      contentSnippet: cleanSnippet,
      publishedAt: entry.isoDate || entry.pubDate || new Date().toISOString(),
    });
  }

  // Persist the new topmost hash so next cycle only sees newer items
  await saveFeedState(feedName, feedUrl, topmostHash, entries.length);

  return newEntries;
}

// Classification result handler 
async function handleClassificationResult(err, result, item) {
  if (err) {
    console.error(`[GoogleAlerts] Classification error for ${item.id}:`, err.message);
    return;
  }
  if (!result || !result.matched) return;

  const cls = result.classification;
  const processedDoc = {
    id: item.id,
    platform: item.platform,
    feedName: item.feedName,
    keyword: item.keyword,
    googleLink: item.googleLink,
    extractedUrl: item.extractedUrl,
    title: item.title,
    contentSnippet: item.contentSnippet,
    fullContent: item.fullContent || null,
    contentSource: item.contentSource,
    content: item.content,
    publishedAt: item.publishedAt,
    scrapedAt: item.scrapedAt,
    topic: cls.topic,
    subTopic: cls.subTopic,
    queryName: cls.queryName,
    internalId: cls.internalId,
    relevantByModel: result.relevantByModel,
    classifiedAt: new Date().toISOString(),
  };

  try {
    await googleAlertsProcessedContainer.items.create(processedDoc);
    console.log(`[GoogleAlerts] Classified ${item.id} via ${result.method}: "${cls.topic}/${cls.subTopic}"`);
  } catch (dbErr) {
    if (dbErr.code === 409) {
      console.log(`[GoogleAlerts] Processed item ${item.id} already exists, skipping`);
    } else {
      console.error(`[GoogleAlerts] Failed to write processed item ${item.id}:`, dbErr.message);
    }
  }
}

// Queue processing
async function processQueue(queue) {
  console.log(`[GoogleAlerts] Processing ${queue.length} queued items...`);

  let skippedNotWebsite = 0;
  let skippedDuplicate = 0;
  let rawInserted = 0;
  let classificationSubmitted = 0;
  let contentFetchSuccess = 0;

  for (const queueItem of queue) {
    const { googleLink, keyword, title, contentSnippet, publishedAt } = queueItem;

    // 1. Extract real URL from Google redirect
    const extractedUrl = extractUrlFromGoogleLink(googleLink);
    if (!extractedUrl) {
      console.warn(`[GoogleAlerts] Could not extract URL from google link for keyword "${keyword}"`);
      continue;
    }

    // 2. NOT websites check
    if (isNotWebsite(extractedUrl)) {
      console.log(`[GoogleAlerts] Blocked website skipped: ${extractedUrl}`);
      skippedNotWebsite++;
      continue;
    }

    // 3. URL-based deduplication, point read by derived ID
    const docId = generateIdFromUrl(extractedUrl);
    try {
      const { resource } = await googleAlertsRawContainer.item(docId, docId).read();
      if (resource) {
        skippedDuplicate++;
        continue;
      }
    } catch (err) {
      if (err.code !== 404) {
        console.error(`[GoogleAlerts] Error checking dup for ${docId}:`, err.message);
        continue;
      }
      // 404 = not yet stored, proceed
    }

    // 4. Fetch full article content via Readability
    const fullContent = await fetchArticleContent(extractedUrl);
    if (fullContent) contentFetchSuccess++;

    const contentSource = fullContent ? 'full' : 'snippet';
    const content = fullContent || contentSnippet;

    // 5. Build and insert raw document
    const rawDoc = {
      id: docId,
      platform: 'google-alerts',
      feedName: keyword,
      keyword,
      query: keyword,
      googleLink,
      extractedUrl,
      title,
      contentSnippet,
      fullContent: fullContent || null,
      contentSource,
      content,
      publishedAt,
      scrapedAt: new Date().toISOString(),
    };

    try {
      await googleAlertsRawContainer.items.create(rawDoc);
      rawInserted++;
    } catch (dbErr) {
      if (dbErr.code === 409) {
        // Race: inserted between dedup check and this create — treat as duplicate
        skippedDuplicate++;
        continue;
      }
      console.error(`[GoogleAlerts] Failed to insert raw item ${docId}:`, dbErr.message);
      continue;
    }

    // 6. Submit to shared classification worker pool
    const jobId = workerPool.submitJob(rawDoc, handleClassificationResult);
    if (jobId) {
      classificationSubmitted++;
    } else {
      console.warn(`[GoogleAlerts] Worker pool full, classification skipped for ${docId}`);
    }
  }

  const stats = { rawInserted, skippedDuplicate, skippedNotWebsite, contentFetchSuccess, classificationSubmitted };
  console.log(`[GoogleAlerts] Queue done: ${rawInserted} inserted, ${skippedDuplicate} duplicates, ${skippedNotWebsite} blocked, ${contentFetchSuccess} full-content fetches, ${classificationSubmitted} classified`);
  return stats;
}

// Main scrape cycle 
async function scrapeAllFeeds() {
  if (isScrapingInProgress) {
    console.warn('[GoogleAlerts] Scrape already running, skipping this cycle');
    return;
  }

  isScrapingInProgress = true;
  const cycleStart = Date.now();
  console.log('[GoogleAlerts] Starting scrape cycle...');

  try {
    // Load all persisted states in one query before we start fetching feeds
    const stateMap = await loadAllFeedStates();

    const feedEntries = Object.entries(RSS_FEEDS);
    const queue = [];
    let feedsScraped = 0;
    let feedsWithNew = 0;
    let feedsFailed = 0;
    let feedsUnchanged = 0;

    // Phase 1: Fetch all feeds in concurrent batches
    for (let i = 0; i < feedEntries.length; i += FEED_FETCH_CONCURRENCY) {
      const batch = feedEntries.slice(i, i + FEED_FETCH_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(([feedName, feedUrl]) => scrapeFeed(feedName, feedUrl, stateMap))
      );

      for (let j = 0; j < results.length; j++) {
        const res = results[j];
        const [feedName] = batch[j];
        feedsScraped++;

        if (res.status === 'rejected') {
          feedsFailed++;
          console.error(`[GoogleAlerts] Feed "${feedName}" threw:`, res.reason?.message);
        } else if (res.value.length === 0) {
          feedsUnchanged++;
        } else {
          feedsWithNew++;
          queue.push(...res.value);
        }
      }
    }

    console.log(`[GoogleAlerts] Scrape phase: ${feedsScraped} feeds, ${feedsWithNew} with new items, ${queue.length} total items, ${feedsFailed} failed, ${feedsUnchanged} unchanged/empty`);

    // Phase 2: Process the collected queue
    let processStats = { rawInserted: 0, skippedDuplicate: 0, skippedNotWebsite: 0, contentFetchSuccess: 0, classificationSubmitted: 0 };
    if (queue.length > 0) {
      processStats = await processQueue(queue);
    }

    lastScrapeAt = new Date().toISOString();
    lastScrapeStats = {
      feedsScraped,
      feedsWithNew,
      feedsFailed,
      feedsUnchanged,
      itemsQueued: queue.length,
      durationMs: Date.now() - cycleStart,
      ...processStats,
    };

    console.log(`[GoogleAlerts] Cycle complete in ${lastScrapeStats.durationMs}ms`);

  } catch (err) {
    console.error('[GoogleAlerts] Scrape cycle fatal error:', err);
  } finally {
    isScrapingInProgress = false;
  }
}

// Public API
function startGoogleAlertsScraper() {
  console.log(`[GoogleAlerts] Scraper starting (interval: ${SCRAPE_INTERVAL / 60000} min)`);
  // Fire-and-forget: scrapeAllFeeds is fully async and yields to the event loop
  // between every I/O operation, so it never blocks the main thread or
  // incoming KWatch webhooks.
  scrapeAllFeeds().catch(err =>
    console.error('[GoogleAlerts] Initial scrape error:', err)
  );
  scraperInterval = setInterval(scrapeAllFeeds, SCRAPE_INTERVAL);
  return scraperInterval;
}

function stopGoogleAlertsScraper() {
  if (scraperInterval) {
    clearInterval(scraperInterval);
    scraperInterval = null;
    console.log('[GoogleAlerts] Scraper stopped');
  }
}

function getScraperStatus() {
  const timeSinceLastScrapeMs = lastScrapeAt ? Date.now() - new Date(lastScrapeAt).getTime() : null;
  return {
    isRunning: isScrapingInProgress,
    lastScrapeAt,
    lastScrapeStats,
    nextScrapeInMs: timeSinceLastScrapeMs !== null
      ? Math.max(0, SCRAPE_INTERVAL - timeSinceLastScrapeMs)
      : null,
    totalFeeds: Object.keys(RSS_FEEDS).length,
    blockedWebsites: NOT_WEBSITES.length,
  };
}

module.exports = {
  startGoogleAlertsScraper,
  stopGoogleAlertsScraper,
  scrapeAllFeeds,
  getScraperStatus,
  // Exported for unit testing
  extractUrlFromGoogleLink,
  isNotWebsite,
};
