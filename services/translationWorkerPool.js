/**
 * Translation Worker Pool
 *
 * Manages concurrent HTTP requests to the Flask translator service.
 * Modeled after classificationWorkerPool.js but uses HTTP instead of child_process.
 *
 * Features:
 *  - Configurable concurrency limit (parallel HTTP requests)
 *  - FIFO queue with backpressure (max queue size)
 *  - Exponential backoff retries
 *  - Graceful degradation (translation failure -> classify with original text)
 *  - Metrics tracking
 *  - Graceful shutdown (waits for in-flight requests)
 */

const { v4: uuidv4 } = require('uuid');

// Configurable via environment variables
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_MAX_QUEUE_SIZE = 500;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 1000;

// Internal state
let translatorUrl = '';
let isInitialized = false;
let shuttingDown = false;
let activeRequests = 0;
let concurrencyLimit = 0;

// FIFO queue of jobs waiting to be processed
const jobQueue = [];

// Metrics
const metrics = {
  jobsSubmitted: 0,
  jobsCompleted: 0,
  jobsFailed: 0,
  translatorErrors: 0,
  processingTimes: [],
  tier1Count: 0,
  tier2Count: 0,
};
const MAX_PROCESSING_TIMES = 1000;

/**
 * Initialize the translation worker pool.
 * Health-checks the Flask translator service.
 * Marks as initialized even if translator is unreachable (graceful degradation).
 * @returns {Promise<void>}
 */
async function initialize() {
  if (isInitialized) return;

  translatorUrl = process.env.TRANSLATOR_URL || 'http://localhost:8000';
  concurrencyLimit = parseInt(process.env.TRANSLATION_CONCURRENCY, 10) || DEFAULT_CONCURRENCY;

  console.log(`[TranslationPool] Initializing (concurrency: ${concurrencyLimit}, translator: ${translatorUrl})`);

  // Health check with retries
  const INIT_TIMEOUT = 30000;
  const start = Date.now();

  while (Date.now() - start < INIT_TIMEOUT) {
    try {
      const response = await fetch(`${translatorUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const health = await response.json();
        const tier1 = health.tier1_count ?? 'unknown';
        const tier2slots = health.tier2_max_slots ?? 'unknown';
        const memMb = health.memory_mb?.rss ?? 'unknown';
        console.log(`[TranslationPool] Translator healthy - Tier1: ${tier1}, Tier2 slots: ${tier2slots}, Memory: ${memMb}MB`);
        if (health.tier1_count === undefined || health.tier2_max_slots === undefined) {
          console.warn('[TranslationPool] Health response missing expected fields (tier1_count/tier2_max_slots) — translator may be running old code');
        }
        isInitialized = true;
        return;
      }
    } catch {
      // Translator not ready yet, retry
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  // Translator not reachable -- still mark initialized for graceful degradation
  console.warn(`[TranslationPool] Translator not reachable at ${translatorUrl}, will retry per-request`);
  isInitialized = true;
}

/**
 * Process queued jobs up to the concurrency limit.
 */
function drainQueue() {
  while (jobQueue.length > 0 && activeRequests < concurrencyLimit && !shuttingDown) {
    const job = jobQueue.shift();
    activeRequests++;
    processJob(job).finally(() => {
      activeRequests--;
      drainQueue();
    });
  }
}

/**
 * Process a single translation job via HTTP POST to the Flask translator.
 * Handles retries with exponential backoff.
 *
 * @param {object} job - { jobId, item, callback, submittedAt, retryCount }
 */
async function processJob(job) {
  const { jobId, item, callback, submittedAt } = job;
  const timeoutMs = parseInt(process.env.TRANSLATION_TIMEOUT_MS, 10) || DEFAULT_TIMEOUT_MS;
  const maxRetries = parseInt(process.env.TRANSLATION_MAX_RETRIES, 10) || DEFAULT_MAX_RETRIES;

  const textToTranslate = `${item.title || ''} ${item.content || ''}`.trim();

  try {
    const response = await fetch(`${translatorUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: textToTranslate,
        source_lang: item._detectedLangISO1,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Translator HTTP ${response.status}: ${body}`);
    }

    const result = await response.json();

    if (result.error) {
      throw new Error(`Translator error: ${result.error}`);
    }

    // Track processing time
    const elapsed = Date.now() - submittedAt;
    metrics.processingTimes.push(elapsed);
    if (metrics.processingTimes.length > MAX_PROCESSING_TIMES) {
      metrics.processingTimes.shift();
    }

    // Track tier
    if (result.tier === 1) metrics.tier1Count++;
    else if (result.tier === 2) metrics.tier2Count++;

    metrics.jobsCompleted++;

    // Enrich item with translation data
    const translatedItem = {
      ...item,
      translatedContent: result.translated_text,
      detectedLanguage: item._detectedLangISO1,
      translationTier: result.tier,
    };
    // Remove internal routing fields
    delete translatedItem._detectedLangISO1;
    delete translatedItem._detectedLangISO3;

    callback(null, translatedItem, item);
  } catch (err) {
    // Retry with exponential backoff
    if (job.retryCount < maxRetries) {
      job.retryCount++;
      const backoff = RETRY_BACKOFF_BASE_MS * Math.pow(2, job.retryCount - 1);
      console.warn(`[TranslationPool] Retrying job ${jobId} (attempt ${job.retryCount}/${maxRetries}) in ${backoff}ms: ${err.message}`);
      setTimeout(() => {
        jobQueue.push(job);
        drainQueue();
      }, backoff);
      return;
    }

    // All retries exhausted, graceful degradation
    metrics.jobsFailed++;
    metrics.translatorErrors++;
    console.error(`[TranslationPool] Job ${jobId} failed after ${maxRetries} retries: ${err.message}`);

    // Return item with null translation so classification still runs with original text
    const failedItem = {
      ...item,
      translatedContent: null,
      detectedLanguage: item._detectedLangISO1,
      translationTier: null,
      translationError: err.message,
    };
    delete failedItem._detectedLangISO1;
    delete failedItem._detectedLangISO3;

    // null error: classification should still proceed
    callback(null, failedItem, item);
  }
}

/**
 * Submit a translation job to the pool.
 *
 * @param {object} item - The item to translate. Must have _detectedLangISO1 set by the caller.
 * @param {function} callback - Called with (error, translatedItem, originalItem) when done
 * @returns {string|null} jobId, or null if rejected (queue full / not initialized)
 */
function submitJob(item, callback) {
  const maxQueue = parseInt(process.env.MAX_TRANSLATION_QUEUE_SIZE, 10) || DEFAULT_MAX_QUEUE_SIZE;

  if (!isInitialized) {
    console.warn('[TranslationPool] Not initialized, rejecting job');
    if (callback) callback(new Error('Translation pool not initialized'), null, item);
    return null;
  }

  if (jobQueue.length + activeRequests >= maxQueue) {
    console.warn(`[TranslationPool] Queue full (${jobQueue.length + activeRequests}/${maxQueue}), rejecting job`);
    if (callback) callback(new Error('Translation queue full'), null, item);
    return null;
  }

  const jobId = uuidv4();
  metrics.jobsSubmitted++;

  jobQueue.push({
    jobId,
    item,
    callback: callback || (() => {}),
    submittedAt: Date.now(),
    retryCount: 0,
  });

  // Trigger queue drain (non-blocking)
  drainQueue();

  return jobId;
}

/**
 * Get current metrics snapshot.
 * @returns {object}
 */
function getMetrics() {
  const times = metrics.processingTimes;
  let avgProcessingTime = 0;
  if (times.length > 0) {
    avgProcessingTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  }

  return {
    initialized: isInitialized,
    translatorUrl,
    concurrencyLimit,
    activeRequests,
    queueDepth: jobQueue.length,
    jobsSubmitted: metrics.jobsSubmitted,
    jobsCompleted: metrics.jobsCompleted,
    jobsFailed: metrics.jobsFailed,
    translatorErrors: metrics.translatorErrors,
    tier1Count: metrics.tier1Count,
    tier2Count: metrics.tier2Count,
    avgProcessingTimeMs: avgProcessingTime,
  };
}

/**
 * Gracefully shut down the translation pool.
 * Waits for in-flight requests to complete (with timeout).
 * @returns {Promise<void>}
 */
async function shutdown() {
  console.log('[TranslationPool] Shutting down...');
  shuttingDown = true;

  // Wait for in-flight requests with timeout
  const SHUTDOWN_TIMEOUT = 15000;
  const start = Date.now();
  while (activeRequests > 0 && Date.now() - start < SHUTDOWN_TIMEOUT) {
    await new Promise(r => setTimeout(r, 200));
  }

  if (activeRequests > 0) {
    console.warn(`[TranslationPool] Forcing shutdown with ${activeRequests} active requests`);
  }

  jobQueue.length = 0;
  isInitialized = false;
  shuttingDown = false;
  console.log('[TranslationPool] Shutdown complete');
}

module.exports = {
  initialize,
  submitJob,
  getMetrics,
  shutdown,
};
