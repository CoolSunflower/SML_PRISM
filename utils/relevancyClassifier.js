/**
 * Relevancy Classifier Utility
 * 
 * Uses ONNX model (SVM) + SBERT embeddings to classify text as relevant or not.
 * This is used as a fallback when brand classification doesn't match.
 * 
 * Model: SBERT (all-MiniLM-L6-v2) + SVM RBF kernel
 * Threshold: Optimized for 95% recall to minimize false negatives
 */

const path = require('path');
const fs = require('fs');

// Model paths
const MODELS_DIR = path.join(__dirname, '..', 'models');
const ONNX_MODEL_PATH = path.join(MODELS_DIR, 'svm_classifier.onnx');
const CONFIG_PATH = path.join(MODELS_DIR, 'model_config.json');

// Classifier state
let isInitialized = false;
let isInitializing = false;
let initPromise = null;

// Model components (loaded dynamically due to ESM)
let ort = null;
let pipeline = null;
let session = null;
let embedder = null;
let config = null;
let inputName = null;

/**
 * Initialize the relevancy classifier
 * Loads the ONNX model and SBERT embedder
 * Safe to call multiple times - will only initialize once
 */
async function initializeRelevancyClassifier() {
  // Return existing promise if already initializing
  if (isInitializing && initPromise) {
    return initPromise;
  }

  // Already initialized
  if (isInitialized) {
    return true;
  }

  isInitializing = true;

  initPromise = (async () => {
    try {
      console.log('[RelevancyClassifier] Initializing...');

      // Check if model files exist
      if (!fs.existsSync(ONNX_MODEL_PATH)) {
        throw new Error(`ONNX model not found at: ${ONNX_MODEL_PATH}`);
      }
      if (!fs.existsSync(CONFIG_PATH)) {
        throw new Error(`Config not found at: ${CONFIG_PATH}`);
      }

      // Load config
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      console.log(`[RelevancyClassifier] Config loaded (threshold: ${config.threshold.toFixed(4)})`);
      console.log(`[RelevancyClassifier] Config loaded (stryker_threshold: ${config.stryker_threshold.toFixed(4)})`);

      // Dynamic import for ESM modules
      const [onnxModule, transformersModule] = await Promise.all([
        import('onnxruntime-node'),
        import('@huggingface/transformers')
      ]);

      ort = onnxModule;
      pipeline = transformersModule.pipeline;

      // Load ONNX model with CPU execution provider (for Linux/Docker compatibility)
      session = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
        executionProviders: ['cpu']
      });
      inputName = session.inputNames[0];
      console.log(`[RelevancyClassifier] ONNX model loaded (input: "${inputName}")`);

      // Load SBERT embedder
      const startEmb = Date.now();
      embedder = await pipeline('feature-extraction', config.embedding_model, {
        quantized: true,
      });

      const embTime = ((Date.now() - startEmb) / 1000).toFixed(2);
      console.log(`[RelevancyClassifier] Embedder loaded in ${embTime}s`);

      isInitialized = true;
      isInitializing = false;
      console.log('[RelevancyClassifier] Initialization complete');
      return true;

    } catch (error) {
      isInitializing = false;
      console.error('[RelevancyClassifier] Initialization failed:', error.message);
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Get SBERT embedding for text
 * @param {string} text - Input text
 * @returns {Promise<Float32Array>} - 384-dimensional embedding
 */
async function getEmbedding(text) {
  if (!isInitialized) {
    throw new Error('RelevancyClassifier not initialized. Call initializeRelevancyClassifier() first.');
  }

  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data);
}

/**
 * Classify text for relevancy
 * @param {string} text - Text to classify
 * @returns {Promise<{isRelevant: boolean, probability: number, label: string}>}
 */
async function classifyRelevancy(text) {
  if (!isInitialized) {
    throw new Error('RelevancyClassifier not initialized. Call initializeRelevancyClassifier() first.');
  }

  // Handle empty or invalid text
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return {
      isRelevant: false,
      probability: 0,
      label: 'Not Related',
      error: 'Empty or invalid text'
    };
  }

  try {
    // Get embedding
    const embedding = await getEmbedding(text);

    // Prepare input tensor - shape [1, 384]
    const inputTensor = new ort.Tensor('float32', embedding, [1, 384]);

    // Run ONNX inference
    const feeds = { [inputName]: inputTensor };
    const results = await session.run(feeds);

    // Get probability from output
    // The ONNX model outputs 'probabilities' with shape [1, 2] for [class_0_prob, class_1_prob]
    const probabilities = results.probabilities.data;
    const probability = probabilities[1]; // Probability of class 1 (Relevant/Mention)

    // Apply threshold - use stryker_threshold if text contains "stryker"
    const containsStryker = text.toLowerCase().includes('stryker');
    const threshold = containsStryker ? config.stryker_threshold : config.threshold;
    const isRelevant = probability >= threshold;

    return {
      isRelevant,
      probability: Number(probability.toFixed(4)),
      label: isRelevant ? 'Mention' : 'Not Related',
      threshold: threshold,
      containsStryker
    };

  } catch (error) {
    console.error('[RelevancyClassifier] Classification error:', error.message);
    return {
      isRelevant: false,
      probability: 0,
      label: 'Not Related',
      error: error.message
    };
  }
}

/**
 * Classify text and return full result with metadata
 * @param {string} text - Text to classify
 * @returns {Promise<object>} - Classification result with all metadata
 */
async function classifyWithMetadata(text) {
  const result = await classifyRelevancy(text);
  return {
    ...result,
    model: config?.embedding_model || 'unknown',
    modelType: config?.model_type || 'unknown'
  };
}

/**
 * Check if classifier is ready
 * @returns {boolean}
 */
function isReady() {
  return isInitialized;
}

/**
 * Get classifier status
 * @returns {object}
 */
function getStatus() {
  return {
    initialized: isInitialized,
    initializing: isInitializing,
    config: config ? {
      threshold: config.threshold,
      embeddingModel: config.embedding_model,
      embeddingDim: config.embedding_dim
    } : null
  };
}

module.exports = {
  initializeRelevancyClassifier,
  classifyRelevancy,
  classifyWithMetadata,
  isReady,
  getStatus
};
