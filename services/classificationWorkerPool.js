/**
 * Classification Worker Pool
 *
 * Manages a pool of Worker Threads that perform brand + relevancy classification.
 * The main thread submits jobs to the pool (non-blocking) and receives results via callbacks.
 *
 * Features:
 *  - Round-robin job distribution
 *  - Worker crash recovery (auto-restart)
 *  - Backpressure handling (max queue size)
 *  - Metrics tracking
 */

const { Worker } = require('worker_threads');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const WORKER_SCRIPT = path.join(__dirname, '..', 'workers', 'classificationWorker.js');

// Configurable via environment variables
const DEFAULT_WORKER_COUNT = 2;
const DEFAULT_MAX_QUEUE_SIZE = 1000;

// Internal state
let workers = [];
let workerCount = 0;
let nextWorkerIndex = 0;
let isInitialized = false;
let shuttingDown = false;

// Map jobId -> { callback, submittedAt }
const pendingJobs = new Map();

// Metrics
const metrics = {
  jobsSubmitted: 0,
  jobsCompleted: 0,
  jobsFailed: 0,
  workerCrashes: 0,
  processingTimes: [],   // last N processing times in ms
};
const MAX_PROCESSING_TIMES = 1000;

/**
 * Create and return a new worker, wiring up message and exit handlers.
 * @param {number} index - Worker index in the pool
 * @returns {{ worker: Worker, ready: boolean, busy: boolean, id: number }}
 */
function createWorkerEntry(index) {
  const worker = new Worker(WORKER_SCRIPT);
  const entry = { worker, ready: false, busy: false, id: index };

  worker.on('message', (msg) => {
    if (msg.type === 'ready') {
      entry.ready = true;
      if (msg.error) {
        console.warn(`[WorkerPool] Worker ${index} ready with warnings: ${msg.error}`);
      } else {
        console.log(`[WorkerPool] Worker ${index} ready`);
      }
      return;
    }

    if (msg.type === 'result') {
      entry.busy = false;
      const pending = pendingJobs.get(msg.jobId);
      if (pending) {
        // Track processing time
        const elapsed = Date.now() - pending.submittedAt;
        metrics.processingTimes.push(elapsed);
        if (metrics.processingTimes.length > MAX_PROCESSING_TIMES) {
          metrics.processingTimes.shift();
        }

        if (msg.success) {
          metrics.jobsCompleted++;
        } else {
          metrics.jobsFailed++;
        }

        pendingJobs.delete(msg.jobId);

        // Invoke callback
        try {
          pending.callback(msg.success ? null : new Error(msg.error), msg.result, pending.originalData);
        } catch (cbErr) {
          console.error(`[WorkerPool] Callback error for job ${msg.jobId}:`, cbErr.message);
        }
      }
    }
  });

  worker.on('error', (err) => {
    console.error(`[WorkerPool] Worker ${index} error:`, err.message);
  });

  worker.on('exit', (code) => {
    if (code !== 0 && !shuttingDown) {
      console.error(`[WorkerPool] Worker ${index} exited with code ${code}, restarting...`);
      metrics.workerCrashes++;
      // Replace the crashed worker
      workers[index] = createWorkerEntry(index);
    }
  });

  return entry;
}

/**
 * Initialize the worker pool.
 * Spawns workers and waits for them all to load their models.
 * @returns {Promise<void>}
 */
async function initialize() {
  if (isInitialized) return;

  workerCount = parseInt(process.env.CLASSIFICATION_WORKERS, 10) || DEFAULT_WORKER_COUNT;
  console.log(`[WorkerPool] Starting ${workerCount} classification workers...`);

  workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(createWorkerEntry(i));
  }

  // Wait for all workers to signal readiness (with a timeout)
  const INIT_TIMEOUT = 120000; // 2 minutes
  await Promise.all(
    workers.map((entry, idx) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker ${idx} timed out during initialization`));
        }, INIT_TIMEOUT);

        const check = setInterval(() => {
          if (entry.ready) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });
    })
  );

  isInitialized = true;
  console.log(`[WorkerPool] All ${workerCount} workers ready`);
}

/**
 * Submit a classification job to the worker pool.
 *
 * @param {object} itemData - The item to classify (must have id, title, content, query)
 * @param {function} callback - Called with (error, result, originalData) when done
 * @returns {string|null} jobId, or null if rejected (queue full / not initialized)
 */
function submitJob(itemData, callback) {
  const maxQueue = parseInt(process.env.MAX_CLASSIFICATION_QUEUE_SIZE, 10) || DEFAULT_MAX_QUEUE_SIZE;

  if (!isInitialized) {
    console.warn('[WorkerPool] Not initialized, rejecting job');
    if (callback) callback(new Error('Worker pool not initialized'), null, itemData);
    return null;
  }

  if (pendingJobs.size >= maxQueue) {
    console.warn(`[WorkerPool] Queue full (${pendingJobs.size}/${maxQueue}), rejecting job`);
    if (callback) callback(new Error('Classification queue full'), null, itemData);
    return null;
  }

  const jobId = uuidv4();

  pendingJobs.set(jobId, {
    callback: callback || (() => {}),
    submittedAt: Date.now(),
    originalData: itemData,
  });

  metrics.jobsSubmitted++;

  // Round-robin pick a worker
  const entry = workers[nextWorkerIndex % workerCount];
  nextWorkerIndex = (nextWorkerIndex + 1) % workerCount;

  entry.busy = true;
  entry.worker.postMessage({
    type: 'classify',
    jobId,
    data: itemData,
  });

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
    workerCount,
    queueDepth: pendingJobs.size,
    jobsSubmitted: metrics.jobsSubmitted,
    jobsCompleted: metrics.jobsCompleted,
    jobsFailed: metrics.jobsFailed,
    workerCrashes: metrics.workerCrashes,
    avgProcessingTimeMs: avgProcessingTime,
    workers: workers.map((e, i) => ({ id: i, ready: e.ready, busy: e.busy })),
  };
}

/**
 * Gracefully shut down all workers.
 * @returns {Promise<void>}
 */
async function shutdown() {
  console.log('[WorkerPool] Shutting down workers...');
  shuttingDown = true;
  const promises = workers.map((entry) => entry.worker.terminate());
  await Promise.allSettled(promises);
  workers = [];
  isInitialized = false;
  console.log('[WorkerPool] All workers terminated');
}

module.exports = {
  initialize,
  submitJob,
  getMetrics,
  shutdown,
};
