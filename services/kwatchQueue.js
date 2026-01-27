const crypto = require('crypto');
const { kwatchContainer, kwatchProcessedContainer } = require('../config/database');
const { classifyText } = require('./brandClassifier');
const { classifyRelevancy, isReady: isRelevancyReady } = require('../utils/relevancyClassifier');

// In-memory queue for handling webhook notifications
const kwatchQueue = [];
let isProcessingQueue = false;
const BATCH_SIZE = 10; // Process 10 items at a time
const BATCH_INTERVAL = 60000; // Process every 60 seconds

// Generate unique ID for KWatch items
function generateKWatchId(platform, datetime, author) {
  const input = `${platform}-${datetime}-${author}-${Date.now()}`;
  return crypto.createHash('md5').update(input).digest('hex');
}

/**
 * Extract subTopic from query string
 * Takes all characters before the first full stop (period)
 * @param {string} query - The query string
 * @returns {string} - Characters before first period, or full string if no period
 */
function extractSubTopicFromQuery(query) {
  if (!query || typeof query !== 'string') {
    return 'Unknown';
  }
  const periodIndex = query.indexOf('.');
  if (periodIndex === -1) {
    return query.trim();
  }
  return query.substring(0, periodIndex).trim() || 'Unknown';
}

/**
 * Classify item using relevancy model (SBERT + SVM)
 * Used as fallback when brand classification doesn't match
 * @param {object} item - The item to classify
 * @returns {Promise<boolean>} - True if item was relevant and pushed to processed container
 */
async function classifyRelevancyAndPushIfRelevant(item) {
  // Ensure relevancy classifier is initialized
  if (!isRelevancyReady()) {
    console.log('[RelevancyClassifier] Model not ready, skipping relevancy check');
    return false;
  }

  // Combine title + content for classification (same as brand classifier)
  const textToClassify = `${item.title || ''} ${item.content || ''}`.trim();
  
  if (!textToClassify) {
    return false;
  }

  try {
    const relevancyResult = await classifyRelevancy(textToClassify);
    
    if (relevancyResult.isRelevant) {
      // Extract subTopic from query (characters before first full stop)
      const subTopic = extractSubTopicFromQuery(item.query);
      
      const processedDocument = {
        id: item.id,
        platform: item.platform,
        query: item.query, // Original KWatch query
        datetime: item.datetime,
        link: item.link,
        author: item.author,
        title: item.title || '',
        content: item.content,
        sentiment: item.sentiment,
        receivedAt: item.receivedAt,
        // Relevancy classification results
        topic: 'General-RelevancyClassification',
        subTopic: subTopic,
        queryName: 'RelevancyClassification',
        internalId: '74747474747474747474747474747474',
        relevantByModel: true
      };

      await kwatchProcessedContainer.items.create(processedDocument);
      console.log(`[RelevancyClassifier] Item ${item.id} classified as RELEVANT (prob: ${relevancyResult.probability}, threshold: ${relevancyResult.threshold}) -> topic: "General-RelevancyClassification", subTopic: "${subTopic}"`);
      return true;
    }
    
    return false;
  } catch (err) {
    // Handle conflict (item already exists) gracefully
    if (err.code === 409) {
      console.log(`[RelevancyClassifier] Item ${item.id} already exists in processed container, skipping`);
    } else {
      console.error(`[RelevancyClassifier] Failed to process item ${item.id}:`, err.message);
    }
    return false;
  }
}

// Classify a single item (based on brand logic) and push to processed container if matched
// Returns: { matched: boolean, method: string } to track classification source
async function classifyAndPushIfMatched(item) {
  // Combine title + content for classification
  const textToClassify = `${item.title || ''} ${item.content || ''}`;
  const classificationResult = classifyText(textToClassify);
  
  // If item matched a brand query, push to processed container
  if (classificationResult.matched) {
    try {
      const classification = classificationResult.classification;

      // For a brand classified item, perform additional relevancy classification
      const relevancyResult = await classifyRelevancy(textToClassify);
      
      const processedDocument = {
        id: item.id,
        platform: item.platform,
        query: item.query, // Original KWatch query
        datetime: item.datetime,
        link: item.link,
        author: item.author,
        title: item.title || '',
        content: item.content,
        sentiment: item.sentiment,
        receivedAt: item.receivedAt,
        // Brand classification results
        topic: classification.topic,
        subTopic: classification.subTopic,
        queryName: classification.queryName,
        internalId: classification.internalId,
        relevantByModel: relevancyResult.isRelevant,
      };

      await kwatchProcessedContainer.items.create(processedDocument);
      console.log(`[BrandClassifier] Item ${item.id} classified as "${classification.topic}/${classification.subTopic}" and pushed to processed container`);
      return { matched: true, method: 'BrandQuery' };
    } catch (err) {
      // Handle conflict (item already exists) gracefully
      if (err.code === 409) {
        console.log(`[BrandClassifier] Item ${item.id} already exists in processed container, skipping`);
        return { matched: true, method: 'BrandQuery', alreadyExists: true };
      } else {
        console.error(`[BrandClassifier] Failed to push item ${item.id} to processed container:`, err.message);
      }
    }
  }
  return { matched: false, method: null };
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

    // Process batch items in parallel
    const results = await Promise.allSettled(
      batch.map(item => kwatchContainer.items.create(item))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Classify items: First try brand classification, then relevancy as fallback
    let brandMatchedCount = 0;
    let relevancyMatchedCount = 0;
    
    for (const item of batch) {
      // Step 1: Try brand classification first
      const brandResult = await classifyAndPushIfMatched(item);
      
      if (brandResult.matched) {
        brandMatchedCount++;
      } else {
        // Step 2: If brand classification didn't match, try relevancy classification
        const relevancyMatched = await classifyRelevancyAndPushIfRelevant(item);
        if (relevancyMatched) {
          relevancyMatchedCount++;
        }
      }
    }

    const totalClassified = brandMatchedCount + relevancyMatchedCount;
    console.log(`Batch complete: ${successful} raw inserted, ${failed} failed | Classified: ${brandMatchedCount} brand, ${relevancyMatchedCount} relevancy (${totalClassified} total)`);
    
    // Log any failures
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
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
  startQueueProcessor
};
