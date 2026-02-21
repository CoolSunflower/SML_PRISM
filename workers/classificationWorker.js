/**
 * Classification Worker Thread
 *
 * Runs inside a Node.js Worker Thread.
 * Loads both brand classifier and relevancy classifier on startup,
 * then processes classification jobs received from the main thread.
 *
 * Protocol:
 *   Main → Worker:  { type: 'classify', jobId, data: { id, title, content, query, ... } }
 *   Worker → Main:  { type: 'ready' }                          (on startup)
 *   Worker → Main:  { type: 'result', jobId, success, result, error }  (per job)
 */

const path = require('path');
process.env.HF_HOME = path.join(__dirname, '..', '.hf-cache');
process.env.TRANSFORMERS_CACHE = path.join(__dirname, '..', '.hf-cache');

const { parentPort } = require('worker_threads');
const { initializeClassifiers, performClassification } = require('../services/classificationService');

let ready = false;

/**
 * Initialize classifiers then signal readiness to main thread.
 */
async function init() {
  try {
    console.log('[Worker] Initializing classifiers...');
    const status = await initializeClassifiers();
    console.log(`[Worker] Brand: ${status.brandReady ? 'Ready' : 'Failed'} (${status.brandQueryCount} queries), Relevancy: ${status.relevancyReady ? 'Ready' : 'Failed'}`);

    ready = true;
    parentPort.postMessage({ type: 'ready' });
  } catch (err) {
    console.error('[Worker] Fatal initialization error:', err.message);
    parentPort.postMessage({ type: 'ready', error: err.message });
  }
}

/**
 * Handle incoming messages from the main thread.
 */
parentPort.on('message', async (msg) => {
  if (msg.type !== 'classify') return;

  const { jobId, data } = msg;

  if (!ready) {
    parentPort.postMessage({
      type: 'result',
      jobId,
      success: false,
      result: null,
      error: 'Worker not ready yet',
    });
    return;
  }

  try {
    const result = await performClassification(data);

    parentPort.postMessage({
      type: 'result',
      jobId,
      success: true,
      result,
      error: null,
    });
  } catch (err) {
    parentPort.postMessage({
      type: 'result',
      jobId,
      success: false,
      result: null,
      error: err.message,
    });
  }
});

// Start initialization immediately
init();
