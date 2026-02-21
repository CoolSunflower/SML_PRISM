/**
 * Classification Worker Process
 *
 * Runs as a separate Node.js child process (not worker thread).
 * Loads both brand classifier and relevancy classifier on startup,
 * then processes classification jobs received from the main process via IPC.
 *
 * This uses child_process instead of worker_threads to avoid V8 HandleScope
 * issues with onnxruntime-node's native bindings.
 *
 * Protocol:
 *   Main → Worker:  { type: 'classify', jobId, data: { id, title, content, query, ... } }
 *   Worker → Main:  { type: 'ready' }                          (on startup)
 *   Worker → Main:  { type: 'result', jobId, success, result, error }  (per job)
 */

const path = require('path');
process.env.HF_HOME = path.join(__dirname, '..', '.hf-cache');
process.env.TRANSFORMERS_CACHE = path.join(__dirname, '..', '.hf-cache');

const { initializeClassifiers, performClassification } = require('../services/classificationService');

let ready = false;

/**
 * Initialize classifiers then signal readiness to parent process.
 */
async function init() {
  try {
    console.log('[Worker] Initializing classifiers...');
    const status = await initializeClassifiers();
    console.log(`[Worker] Brand: ${status.brandReady ? 'Ready' : 'Failed'} (${status.brandQueryCount} queries), Relevancy: ${status.relevancyReady ? 'Ready' : 'Failed'}`);

    ready = true;
    process.send({ type: 'ready' });
  } catch (err) {
    console.error('[Worker] Fatal initialization error:', err.message);
    process.send({ type: 'ready', error: err.message });
  }
}

/**
 * Handle incoming messages from the parent process.
 */
process.on('message', async (msg) => {
  if (msg.type !== 'classify') return;

  const { jobId, data } = msg;

  if (!ready) {
    process.send({
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

    process.send({
      type: 'result',
      jobId,
      success: true,
      result,
      error: null,
    });
  } catch (err) {
    process.send({
      type: 'result',
      jobId,
      success: false,
      result: null,
      error: err.message,
    });
  }
});

// Handle disconnect/exit
process.on('disconnect', () => {
  console.log('[Worker] Parent disconnected, exiting...');
  process.exit(0);
});

// Start initialization immediately
init();
