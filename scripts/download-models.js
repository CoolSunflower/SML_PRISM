/**
 * Pre-download HuggingFace models for Docker build
 * This ensures models are cached in the image and don't need to be downloaded at runtime
 */

const path = require('path');
const fs = require('fs');

const CACHE_DIR = path.join(__dirname, '..', '.hf-cache');
const CONFIG_PATH = path.join(__dirname, '..', 'models', 'model_config.json');

async function downloadModels() {
  try {
    console.log('[Model Download] Starting model pre-download...');
    
    // Create cache directory
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      console.log(`[Model Download] Created cache directory: ${CACHE_DIR}`);
    }

    // Set cache directory for transformers (use HF_HOME as primary)
    process.env.HF_HOME = CACHE_DIR;
    process.env.TRANSFORMERS_CACHE = CACHE_DIR;

    // Load config to get model name
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const modelName = config.embedding_model;
    console.log(`[Model Download] Target model: ${modelName}`);

    // Dynamic import of transformers
    const { pipeline } = await import('@huggingface/transformers');

    // Download and cache the model
    console.log('[Model Download] Downloading model (this may take a few minutes)...');
    const embedder = await pipeline('feature-extraction', modelName, {
      quantized: true
    });

    // Test the model with a simple embedding
    console.log('[Model Download] Testing model...');
    const testInput = 'Test sentence for model validation';
    const output = await embedder(testInput, { pooling: 'mean', normalize: true });
    
    console.log(`[Model Download] Model test successful! Output shape: [${output.dims.join(', ')}]`);
    console.log(`[Model Download] Cache location: ${CACHE_DIR}`);
    console.log('[Model Download] ✓ Model download complete and verified!');
    
    process.exit(0);
  } catch (error) {
    console.error('[Model Download] Failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

downloadModels();
