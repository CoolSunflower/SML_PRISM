/**
 * Classification Service
 *
 * Shared classification logic used by worker threads.
 * Performs brand classification (rule-based AST matching) and relevancy classification (SBERT + SVM).
 *
 * This module is designed to be loaded inside a Worker Thread, where it initializes
 * its own instances of the brand classifier and relevancy classifier.
 */

const { initializeBrandClassifier, classifyText } = require('./brandClassifier');
const { initializeRelevancyClassifier, classifyRelevancy, isReady: isRelevancyReady } = require('../utils/relevancyClassifier');

/**
 * Initialize all classifiers (brand + relevancy).
 * Must be called once before performClassification().
 * @returns {Promise<{brandReady: boolean, relevancyReady: boolean, brandQueryCount: number}>}
 */
async function initializeClassifiers() {
  const result = { brandReady: false, relevancyReady: false, brandQueryCount: 0 };

  // Initialize Brand Classifier
  try {
    const brandInit = await initializeBrandClassifier();
    result.brandReady = brandInit.success;
    result.brandQueryCount = brandInit.queryCount || 0;
  } catch (err) {
    console.error('[ClassificationService] Brand classifier init failed:', err.message);
  }

  // Initialize Relevancy Classifier
  try {
    await initializeRelevancyClassifier();
    result.relevancyReady = isRelevancyReady();
  } catch (err) {
    console.error('[ClassificationService] Relevancy classifier init failed:', err.message);
  }

  return result;
}

/**
 * Extract subTopic from query string.
 * Takes all characters before the first full stop (period).
 * @param {string} query - The query string
 * @returns {string}
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
 * Perform full classification on an item.
 *
 * Flow:
 * 1. Try brand classification (async, rule-based AST matching)
 * 2. If brand matched: also run relevancy to annotate relevantByModel
 * 3. If brand did NOT match: run relevancy as fallback
 *
 * @param {object} item - The item to classify. Must have: { id, title, content, query }
 * @returns {Promise<{matched: boolean, method: string|null, classification: object|null, relevantByModel: boolean}>}
 */
async function performClassification(item) {
  const textToClassify = `${item.title || ''} ${item.content || ''}`.trim();

  if (!textToClassify) {
    return { matched: false, method: null, classification: null, relevantByModel: false };
  }

  // Step 1: Try brand classification
  const brandResult = await classifyText(textToClassify);

  if (brandResult.matched) {
    // Brand matched - also run relevancy to annotate
    let relevantByModel = false;
    try {
      if (isRelevancyReady()) {
        const relevancyResult = await classifyRelevancy(textToClassify);
        relevantByModel = relevancyResult.isRelevant;
      }
    } catch (err) {
      console.error('[ClassificationService] Relevancy check failed for brand-matched item:', err.message);
    }

    return {
      matched: true,
      method: 'BrandQuery',
      classification: {
        topic: brandResult.classification.topic,
        subTopic: brandResult.classification.subTopic,
        queryName: brandResult.classification.queryName,
        internalId: brandResult.classification.internalId,
      },
      relevantByModel,
    };
  }

  // Step 2: Brand didn't match - try relevancy as fallback
  if (isRelevancyReady()) {
    try {
      const relevancyResult = await classifyRelevancy(textToClassify);

      if (relevancyResult.isRelevant) {
        const subTopic = extractSubTopicFromQuery(item.query);

        return {
          matched: true,
          method: 'RelevancyClassification',
          classification: {
            topic: 'General-RelevancyClassification',
            subTopic: subTopic,
            queryName: 'RelevancyClassification',
            internalId: '74747474747474747474747474747474',
          },
          relevantByModel: true,
        };
      }
    } catch (err) {
      console.error('[ClassificationService] Relevancy classification failed:', err.message);
    }
  }

  return { matched: false, method: null, classification: null, relevantByModel: false };
}

module.exports = {
  initializeClassifiers,
  performClassification,
  extractSubTopicFromQuery,
};
