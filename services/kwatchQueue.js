const crypto = require('crypto');
const { kwatchContainer, kwatchProcessedContainer } = require('../config/database');
const workerPool = require('./classificationWorkerPool');

// In-memory queue for handling webhook notifications
const kwatchQueue = [];
let isProcessingQueue = false;
const BATCH_SIZE = 10; // Process 10 items at a time
const BATCH_INTERVAL = 60000; // Process every 60 seconds

// Generate ID for KWatch items - using content
function generateKWatchId(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

// In case of duplicate item, generate completely unique ID and mark item as duplicate
function generateKWatchUniqueId(platform, datetime, author) {
  const input = `${platform}-${datetime}-${author}-${Date.now()}`;
  return crypto.createHash('md5').update(input).digest('hex');
}

/**
 * Callback invoked when a worker finishes classifying a KWatch item.
 * Writes the result to the kwatchProcessedContainer if the item was classified.
 */
async function handleClassificationResult(err, result, item) {
  if (err) {
    console.error(`[KWatchQueue] Classification failed for item ${item.id}:`, err.message);
    return;
  }

  if (!result || !result.matched) {
    return;
  }

  const classification = result.classification;
  const processedDocument = {
    id: item.id,
    platform: item.platform,
    query: item.query,
    datetime: item.datetime,
    link: item.link,
    author: item.author,
    title: item.title || '',
    content: item.content,
    sentiment: item.sentiment,
    receivedAt: item.receivedAt,
    topic: classification.topic,
    subTopic: classification.subTopic,
    queryName: classification.queryName,
    internalId: classification.internalId,
    relevantByModel: result.relevantByModel,
    isDuplicate: item.isDuplicate || false,
  };

  try {
    await kwatchProcessedContainer.items.create(processedDocument);
    console.log(`[KWatchQueue] Item ${item.id} classified via ${result.method}: "${classification.topic}/${classification.subTopic}"`);
  } catch (dbErr) {
    if (dbErr.code === 409) {
      console.log(`[KWatchQueue] Item ${item.id} already exists in processed container, skipping`);
    } else {
      console.error(`[KWatchQueue] Failed to write processed item ${item.id}:`, dbErr.message);
    }
  }
}

// Process queue in batches
async function processKWatchQueue() {
  if (isProcessingQueue || kwatchQueue.length === 0) {
    return;
  }

  isProcessingQueue = true;

  try {
    const batch = kwatchQueue.splice(0, BATCH_SIZE);
    console.log(`Processing ${batch.length} KWatch notifications...`);

    // Step 1: Insert raw items in parallel
    const results = await Promise.allSettled(
      batch.map(item => kwatchContainer.items.create(item))
    );

    const handledDuplicateIndexes = new Set();
    let duplicateInsertedCount = 0;
    let duplicateInsertFailedCount = 0;

    // Handle duplicate inserts
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected' && result.reason.code === 409) {
        const originalItem = batch[i];
        const newId = generateKWatchUniqueId(originalItem.platform, originalItem.datetime, originalItem.author);
        const duplicateItem = {
          ...originalItem,
          id: newId,
          isDuplicate: true
        };
        try {
          await kwatchContainer.items.create(duplicateItem);
          console.log(`Duplicate item inserted with new ID: ${newId}`);
          batch[i] = duplicateItem;
          handledDuplicateIndexes.add(i);
          duplicateInsertedCount++;
        } catch (err) {
          duplicateInsertFailedCount++;
          console.error(`Failed to insert duplicate item ${newId}:`, err.message);
        }
      }
    }

    const successful = results.filter(r => r.status === 'fulfilled').length + duplicateInsertedCount;
    const failed = results.filter((r, idx) => r.status === 'rejected' && !handledDuplicateIndexes.has(idx)).length + duplicateInsertFailedCount;

    // Step 2: Submit classification jobs to worker pool
    let jobsSubmitted = 0;
    for (const item of batch) {
      const jobId = workerPool.submitJob(item, handleClassificationResult);
      if (jobId) {
        jobsSubmitted++;
      }
    }

    console.log(`Batch complete: ${successful} raw inserted, ${failed} failed, ${duplicateInsertedCount} duplicates | ${jobsSubmitted} classification jobs submitted to workers`);

    // Log any insert failures
    results.forEach((result, idx) => {
      if (result.status === 'rejected' && !handledDuplicateIndexes.has(idx)) {
        console.error(`Failed to insert item ${batch[idx].id}:`, result.reason);
      }
    });

  } catch (error) {
    console.error('Queue processing error:', error);
  } finally {
    isProcessingQueue = false;
  }
}

// Add item to queue
function addToQueue(document) {
  kwatchQueue.push(document);
  return kwatchQueue.length;
}

// Get queue status
function getQueueStatus() {
  return {
    pending: kwatchQueue.length,
    processing: isProcessingQueue
  };
}

// Start queue processor interval
function startQueueProcessor() {
  return setInterval(processKWatchQueue, BATCH_INTERVAL);
}

module.exports = {
  generateKWatchId,
  addToQueue,
  getQueueStatus,
  startQueueProcessor,
  processKWatchQueue  // Export for testing purposes
};
