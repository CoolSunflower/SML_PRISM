/**
 * ONNX Model Classifier Test Script
 * Tests the trained SVM model (ONNX) + SBERT embeddings on HistoricData.csv
 * 
 * This script:
 * - Loads the ONNX SVM model
 * - Uses @xenova/transformers for SBERT embeddings
 * - Runs classification on all historic data
 * - Measures accuracy, performance, and resource usage
 * 
 * Usage:
 *   node test-onnx-classifier.mjs              # Run on all data
 *   node test-onnx-classifier.mjs --sample 50  # Run on 50 samples
 *   node test-onnx-classifier.mjs --verbose    # Show individual predictions
 */

import { pipeline } from '@huggingface/transformers';
import * as ort from 'onnxruntime-node';
import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  modelDir: path.join(__dirname, 'models'),
  onnxModelPath: path.join(__dirname, 'models', 'svm_classifier.onnx'),
  configPath: path.join(__dirname, 'models', 'model_config.json'),
  historicDataPath: path.join(__dirname, 'HistoricData.csv'),
  sampleSize: null, // null = all data
  verbose: false,
  batchSize: 32,
};

// Parse CLI args
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sample' && args[i + 1]) {
    CONFIG.sampleSize = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--verbose') {
    CONFIG.verbose = true;
  }
}

// ============================================================================
// COLORS FOR TERMINAL OUTPUT
// ============================================================================
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  magenta: '\x1b[35m',
};

// ============================================================================
// RESOURCE MONITORING (from test-resource.mjs)
// ============================================================================
const toMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
let previousCpuUsage = process.cpuUsage();

function logStats(label) {
  const mem = process.memoryUsage();
  const currentCpu = process.cpuUsage(previousCpuUsage);
  previousCpuUsage = process.cpuUsage();

  console.log(`\n${colors.cyan}--- [${label}] ---${colors.reset}`);
  console.log(`💾 RAM (RSS)       : ${toMB(mem.rss)} MB`);
  console.log(`🧠 RAM (Heap Used) : ${toMB(mem.heapUsed)} MB`);
  console.log(`📦 RAM (External)  : ${toMB(mem.external)} MB`);
  console.log(`⚡ CPU (User)      : ${(currentCpu.user / 1000).toFixed(0)} ms`);
  console.log(`---------------------------------------------------\n`);
}

// ============================================================================
// CSV PARSER (from test-classifier.js)
// ============================================================================
function parseCSV(content) {
  const rows = [];
  let headers = null;
  let i = 0;
  const len = content.length;

  while (i < len) {
    const { values, nextIndex } = parseCSVRow(content, i);
    i = nextIndex;
    if (values.length === 0) continue;

    if (!headers) {
      headers = values.map(h => h.trim());
    } else {
      const row = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });
      rows.push(row);
    }
  }
  return rows;
}

function parseCSVRow(content, startIndex) {
  const values = [];
  let current = '';
  let inQuotes = false;
  let i = startIndex;
  const len = content.length;

  while (i < len) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i += 2;
      } else if (char === '"') {
        inQuotes = false;
        i++;
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        values.push(current);
        current = '';
        i++;
      } else if (char === '\r' && nextChar === '\n') {
        values.push(current);
        i += 2;
        break;
      } else if (char === '\n') {
        values.push(current);
        i++;
        break;
      } else {
        current += char;
        i++;
      }
    }
  }

  if (i >= len && (current.length > 0 || values.length > 0)) {
    values.push(current);
  }

  return { values, nextIndex: i };
}

// ============================================================================
// CLASSIFIER CLASS
// ============================================================================
class ONNXClassifier {
  constructor() {
    this.session = null;
    this.embedder = null;
    this.config = null;
    this.inputName = null;  // Will be set from ONNX model
  }

  async load() {
    console.log(`${colors.cyan}Loading ONNX model and embedder...${colors.reset}`);
    
    // Load config
    if (!fs.existsSync(CONFIG.configPath)) {
      throw new Error(`Config not found: ${CONFIG.configPath}`);
    }
    this.config = JSON.parse(fs.readFileSync(CONFIG.configPath, 'utf-8'));
    console.log(`  ✓ Config loaded (threshold: ${this.config.threshold.toFixed(4)})`);

    // Load ONNX model
    if (!fs.existsSync(CONFIG.onnxModelPath)) {
      throw new Error(`ONNX model not found: ${CONFIG.onnxModelPath}`);
    }
    this.session = await ort.InferenceSession.create(CONFIG.onnxModelPath);
    
    // Get the actual input name from the model
    this.inputName = this.session.inputNames[0];
    console.log(`  ✓ ONNX model loaded (input: "${this.inputName}")`);
    
    // Debug: show all input/output names
    console.log(`    Inputs: ${this.session.inputNames.join(', ')}`);
    console.log(`    Outputs: ${this.session.outputNames.join(', ')}`);

    // Load SBERT embedder
    const startEmb = performance.now();
    this.embedder = await pipeline('feature-extraction', this.config.embedding_model, {
      quantized: true,
    });
    const endEmb = performance.now();
    console.log(`  ✓ Embedder loaded in ${((endEmb - startEmb) / 1000).toFixed(2)}s`);
  }

  async getEmbedding(text) {
    const output = await this.embedder(text, { pooling: 'mean', normalize: true });
    // Convert to flat array
    return Array.from(output.data);
  }

  async predict(text) {
    // Get embedding
    const embedding = await this.getEmbedding(text);
    
    // Prepare input tensor - shape [1, 384]
    const inputTensor = new ort.Tensor('float32', Float32Array.from(embedding), [1, 384]);
    
    // Run ONNX inference using the actual input name from model
    const feeds = { [this.inputName]: inputTensor };
    const results = await this.session.run(feeds);
    
    // Get probability from output
    // The ONNX model outputs 'probabilities' with shape [1, 2] for [class_0_prob, class_1_prob]
    const probabilities = results.probabilities.data;
    const prob = probabilities[1]; // Probability of class 1 (Mention)
    
    // Apply threshold - use stryker_threshold if text contains "stryker"
    const containsStryker = text.toLowerCase().includes('stryker');
    const threshold = containsStryker ? this.config.stryker_threshold : this.config.threshold;
    const prediction = prob >= threshold ? 1 : 0;
    
    return {
      prediction,
      probability: prob,
      label: this.config.classes[prediction],
      threshold,
      containsStryker
    };
  }

  async predictBatch(texts) {
    const results = [];
    for (const text of texts) {
      results.push(await this.predict(text));
    }
    return results;
  }
}

// ============================================================================
// MAIN TEST FUNCTION
// ============================================================================
async function runTest() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bold}ONNX CLASSIFIER TEST${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);

  // Baseline stats
  if (global.gc) global.gc();
  logStats('Baseline (Before Load)');

  // 1. Load classifier
  const classifier = new ONNXClassifier();
  const startLoad = performance.now();
  await classifier.load();
  const endLoad = performance.now();
  console.log(`\n${colors.green}✓ Total load time: ${((endLoad - startLoad) / 1000).toFixed(2)}s${colors.reset}`);
  logStats('After Model Load');

  // 2. Load historic data
  console.log(`${colors.cyan}Loading historic data...${colors.reset}`);
  if (!fs.existsSync(CONFIG.historicDataPath)) {
    throw new Error(`Historic data not found: ${CONFIG.historicDataPath}`);
  }
  const csvContent = fs.readFileSync(CONFIG.historicDataPath, 'utf-8');
  let data = parseCSV(csvContent);
  console.log(`  ✓ Loaded ${data.length} total rows`);

  // Apply SAME preprocessing as notebook:
  // 1. Drop rows where Mention Content ends with '...'
  // 2. Drop rows where Mention Content is empty/null
  // 3. Drop rows where Mention Content is 'Deleted or protected mention'
  const beforePreprocess = data.length;
  data = data.filter(row => {
    const content = row['Mention Content'] || '';
    if (!content || content.trim() === '') return false;
    if (content.endsWith('...')) return false;
    if (content === 'Deleted or protected mention') return false;
    return true;
  });
  console.log(`  ✓ After content preprocessing: ${data.length} rows (removed ${beforePreprocess - data.length})`);

  // 4. Filter to our two classes (same as notebook)
  const validClasses = ['Not Related To SYK/WM', 'Mention'];
  data = data.filter(row => validClasses.includes(row['Classifiers tags']));
  console.log(`  ✓ After class filtering: ${data.length} rows with valid classes`);

  // Sample if needed
  if (CONFIG.sampleSize && CONFIG.sampleSize < data.length) {
    // Stratified sampling
    const class0 = data.filter(r => r['Classifiers tags'] === 'Not Related To SYK/WM');
    const class1 = data.filter(r => r['Classifiers tags'] === 'Mention');
    const ratio = class1.length / data.length;
    
    const n1 = Math.round(CONFIG.sampleSize * ratio);
    const n0 = CONFIG.sampleSize - n1;
    
    // Shuffle and take
    const shuffle = arr => arr.sort(() => Math.random() - 0.5);
    data = [...shuffle(class0).slice(0, n0), ...shuffle(class1).slice(0, n1)];
    shuffle(data);
    console.log(`  ✓ Sampled to ${data.length} rows (${n1} Mention, ${n0} Not Related)`);
  }

  // 3. Run predictions
  console.log(`\n${colors.cyan}Running predictions on ${data.length} samples...${colors.reset}`);
  
  const predictions = [];
  const labels = [];
  const times = [];
  
  const startPred = performance.now();
  let processed = 0;
  let strykerCount = 0;
  
  for (const row of data) {
    const text = row['Mention Content'] || '';
    const actualLabel = row['Classifiers tags'] === 'Mention' ? 1 : 0;
    
    const t0 = performance.now();
    const result = await classifier.predict(text);
    const t1 = performance.now();

    if (result.containsStryker) strykerCount++;
    
    predictions.push(result.prediction);
    labels.push(actualLabel);
    times.push(t1 - t0);
    
    processed++;
    if (processed % 50 === 0) {
      process.stdout.write(`\r  Processed ${processed}/${data.length}...`);
    }
    
    if (CONFIG.verbose) {
      const correct = result.prediction === actualLabel;
      const symbol = correct ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      const textPreview = text.substring(0, 60).replace(/\n/g, ' ');
      console.log(`  ${symbol} [${result.probability.toFixed(4)}] "${textPreview}..."`);
    }
  }
  
  const endPred = performance.now();
  console.log(`\r  ✓ Processed ${processed}/${data.length} samples`);
  
  logStats('After Predictions');

  // 4. Calculate metrics
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${colors.bold}RESULTS${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);

  // Confusion matrix
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] === 1 && labels[i] === 1) tp++;
    else if (predictions[i] === 0 && labels[i] === 0) tn++;
    else if (predictions[i] === 1 && labels[i] === 0) fp++;
    else if (predictions[i] === 0 && labels[i] === 1) fn++;
  }

  const accuracy = (tp + tn) / (tp + tn + fp + fn);
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  const f1 = 2 * precision * recall / (precision + recall) || 0;

  console.log(`${colors.cyan}Classification Metrics:${colors.reset}`);
  console.log(`  Accuracy  : ${(accuracy * 100).toFixed(2)}%`);
  console.log(`  Precision : ${(precision * 100).toFixed(2)}%`);
  console.log(`  Recall    : ${(recall * 100).toFixed(2)}% ${colors.dim}(target: 95%)${colors.reset}`);
  console.log(`  F1 Score  : ${(f1 * 100).toFixed(2)}%`);
  
  console.log(`\n${colors.cyan}Confusion Matrix:${colors.reset}`);
  console.log(`                 Predicted`);
  console.log(`                 Not Rel.  Mention`);
  console.log(`  Actual Not Rel.   ${String(tn).padStart(4)}     ${String(fp).padStart(4)}`);
  console.log(`  Actual Mention    ${String(fn).padStart(4)}     ${String(tp).padStart(4)}`);

  console.log(`\n${colors.cyan}Performance Metrics:${colors.reset}`);
  const totalTime = endPred - startPred;
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log(`  Total Time     : ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`  Avg per sample : ${avgTime.toFixed(2)}ms`);
  console.log(`  Min time       : ${minTime.toFixed(2)}ms`);
  console.log(`  Max time       : ${maxTime.toFixed(2)}ms`);
  console.log(`  Throughput     : ${(1000 / avgTime).toFixed(1)} samples/sec`);

  // Stryker-specific metrics
  console.log(`\n${colors.cyan}Stryker-Specific Metrics:${colors.reset}`);
  console.log(`  Samples containing "stryker" detected: ${strykerCount}`);
  const strykerIndices = [];
  for (let i = 0; i < data.length; i++) {
    const text = (data[i]['Mention Content'] || '').toLowerCase();
    if (text.includes('stryker')) {
      strykerIndices.push(i);
    }
  }
  
  if (strykerIndices.length > 0) {
    let stp = 0, stn = 0, sfp = 0, sfn = 0;
    for (const i of strykerIndices) {
      if (predictions[i] === 1 && labels[i] === 1) stp++;
      else if (predictions[i] === 0 && labels[i] === 0) stn++;
      else if (predictions[i] === 1 && labels[i] === 0) sfp++;
      else if (predictions[i] === 0 && labels[i] === 1) sfn++;
    }
    
    const sAccuracy = (stp + stn) / (stp + stn + sfp + sfn);
    const sPrecision = stp / (stp + sfp) || 0;
    const sRecall = stp / (stp + sfn) || 0;
    const sF1 = 2 * sPrecision * sRecall / (sPrecision + sRecall) || 0;
    
    console.log(`  Samples with "stryker": ${strykerIndices.length}`);
    console.log(`  Accuracy  : ${(sAccuracy * 100).toFixed(2)}%`);
    console.log(`  Precision : ${(sPrecision * 100).toFixed(2)}%`);
    console.log(`  Recall    : ${(sRecall * 100).toFixed(2)}%`);
    console.log(`  F1 Score  : ${(sF1 * 100).toFixed(2)}%`);
    console.log(`  Confusion Matrix:`);
    console.log(`    TN: ${stn}, FP: ${sfp}, FN: ${sfn}, TP: ${stp}`);
  } else {
    console.log(`  No samples containing "stryker" found`);
  }

  console.log(`\n${colors.cyan}Model Config:${colors.reset}`);
  console.log(`  Threshold : ${classifier.config.threshold.toFixed(4)}`);
  console.log(`  Embedding : ${classifier.config.embedding_model}`);
  console.log(`  Dim       : ${classifier.config.embedding_dim}`);

  // Final memory
  logStats('Final');
  
  console.log(`${'='.repeat(80)}`);
  console.log(`${colors.bold}TEST COMPLETE${colors.reset}`);
  console.log(`${'='.repeat(80)}\n`);
}

// Run
runTest().catch(err => {
  console.error(`${colors.red}Error: ${err.message}${colors.reset}`);
  console.error(err.stack);
  process.exit(1);
});
