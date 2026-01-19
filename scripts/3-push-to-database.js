/**
 * Step 3: Push classified items to the processed container
 * 
 * Run: npm run migrate:push
 * 
 * Options:
 *   --clear    Delete all existing items from processed container before migration
 * 
 * This script loads the locally saved raw data, classifies each item,
 * and pushes matched items to the processed container in batches.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { kwatchProcessedContainer } = require('../config/database');
const { initializeBrandClassifier, classifyText } = require('../services/brandClassifier');

// Parse command line arguments
const args = process.argv.slice(2);
const CLEAR_BEFORE_MIGRATION = args.includes('--clear');

// Configuration
const BATCH_SIZE = 100; // Process 50 items per batch
const DELAY_BETWEEN_BATCHES = 500; // 500ms delay between batches

// Input file path (output from step 1)
const INPUT_FILE = path.join(__dirname, 'data', 'raw-data.json');

/**
 * Delete all items from the processed container
 * @returns {Promise<{deleted: number, errors: number}>}
 */
async function clearProcessedContainer() {
  console.log('Clearing processed container...');
  
  let deleted = 0;
  let errors = 0;
  let hasMore = true;
  
  while (hasMore) {
    // Query a batch of items (need id and platform for partition key)
    const querySpec = {
      query: 'SELECT c.id, c.platform FROM c'
    };
    
    const { resources: items } = await kwatchProcessedContainer.items
      .query(querySpec)
      .fetchNext();
    
    if (!items || items.length === 0) {
      hasMore = false;
      break;
    }
    
    // Delete items in parallel (using [platform, id] as partition key)
    const deletePromises = items.map(async (item) => {
      try {
        await kwatchProcessedContainer.item(item.id, [item.platform, item.id]).delete();
        return { success: true };
      } catch (err) {
        if (err.code === 404) {
          return { success: true }; // Already deleted
        }
        console.error(`Failed to delete ${item.id}: ${err.message}`);
        return { success: false };
      }
    });
    
    const results = await Promise.all(deletePromises);
    deleted += results.filter(r => r.success).length;
    errors += results.filter(r => !r.success).length;
    
    process.stdout.write(`\r   Deleted: ${deleted} items...`);
    
    // Small delay to avoid throttling
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n   Cleared ${deleted} items from processed container`);
  if (errors > 0) {
    console.log(`   Errors during deletion: ${errors}`);
  }
  
  return { deleted, errors };
}

/**
 * Classify and push a single item to processed container if matched
 * @param {Object} item - Raw KWatch item
 * @returns {Object} Result object with status
 */
async function classifyAndPush(item) {
  try {
    // Combine title + content for classification
    const textToClassify = `${item.title || ''} ${item.content || ''}`;
    const classificationResult = classifyText(textToClassify);
    
    // If item matched a brand query, push to processed container
    if (classificationResult.matched) {
      const classification = classificationResult.classification;
      
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
        // Brand classification results
        topic: classification.topic,
        subTopic: classification.subTopic,
        queryName: classification.queryName,
        internalId: classification.internalId,
        // Migration metadata
        migratedAt: new Date().toISOString(),
      };

      await kwatchProcessedContainer.items.upsert(processedDocument);
      return { status: 'pushed', id: item.id, topic: classification.topic };
    } else {
      return { status: 'no-match', id: item.id };
    }
  } catch (err) {
    if (err.code === 409) {
      return { status: 'already-exists', id: item.id };
    } else {
      return { status: 'error', id: item.id, error: err.message };
    }
  }
}

/**
 * Process items in batches
 * @param {Array} items - Array of raw items
 */
async function processBatches(items) {
  const totalItems = items.length;
  let processedCount = 0;
  let pushedCount = 0;
  let noMatchCount = 0;
  let alreadyExistsCount = 0;
  let errorCount = 0;
  const errors = [];
  
  console.log(`Starting batch processing (${totalItems} items, batch size: ${BATCH_SIZE})\n`);
  
  for (let i = 0; i < totalItems; i += BATCH_SIZE) {
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(totalItems / BATCH_SIZE);
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchSize = batch.length;
    
    // Process batch items in parallel
    const results = await Promise.all(
      batch.map(item => classifyAndPush(item))
    );
    
    // Count results
    const batchPushed = results.filter(r => r.status === 'pushed').length;
    const batchNoMatch = results.filter(r => r.status === 'no-match').length;
    const batchAlreadyExists = results.filter(r => r.status === 'already-exists').length;
    const batchErrors = results.filter(r => r.status === 'error');
    
    pushedCount += batchPushed;
    noMatchCount += batchNoMatch;
    alreadyExistsCount += batchAlreadyExists;
    errorCount += batchErrors.length;
    processedCount += batchSize;
    
    // Collect errors
    batchErrors.forEach(e => errors.push(e));
    
    // Progress display
    const progress = (processedCount / totalItems * 100).toFixed(1);
    const barLength = 40;
    const filledLength = Math.round(barLength * processedCount / totalItems);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    process.stdout.write(`\r   [${bar}] ${progress}% | Batch ${batchNumber}/${totalBatches} | Pushed: ${pushedCount} | No Match: ${noMatchCount}`);
    
    // Delay between batches
    if (i + BATCH_SIZE < totalItems) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }
  
  console.log('\n');
  
  return {
    processedCount,
    pushedCount,
    noMatchCount,
    alreadyExistsCount,
    errorCount,
    errors
  };
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          Step 3: Push Classified Items to Database                            ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Check if input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Input file not found: ${INPUT_FILE}`);
    console.error('   Please run "npm run migrate:fetch" first.\n');
    process.exit(1);
  }
  
  // Load data
  console.log(`Loading data from: ${INPUT_FILE}`);
  const items = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`   Loaded ${items.length} items\n`);
  
  // Initialize classifier
  console.log('Initializing Brand Classifier...');
  const classifierInit = await initializeBrandClassifier();
  if (!classifierInit.success) {
    console.error(`Brand Classifier initialization failed: ${classifierInit.error}`);
    process.exit(1);
  }
  console.log(`Classifier ready with ${classifierInit.queryCount} queries\n`);
  
  // Clear processed container if --clear flag is set
  if (CLEAR_BEFORE_MIGRATION) {
    console.log('');
    await clearProcessedContainer();
    console.log('');
  }
  
  // Confirmation prompt
  console.log('WARNING: This will push data to the processed container!');
  console.log(`   Items to process: ${items.length}`);
  console.log('');
  
  // Process
  const results = await processBatches(items);
  
  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('='.repeat(80));
  console.log('MIGRATION COMPLETE\n');
  console.log('Final Statistics:');
  console.log(`   Total Processed:     ${results.processedCount}`);
  console.log(`   Successfully Pushed: ${results.pushedCount} (${(results.pushedCount/results.processedCount*100).toFixed(1)}%)`);
  console.log(`   No Match:            ${results.noMatchCount} (${(results.noMatchCount/results.processedCount*100).toFixed(1)}%)`);
  console.log(`   Already Existed:     ${results.alreadyExistsCount} (${(results.alreadyExistsCount/results.processedCount*100).toFixed(1)}%)`);
  if (results.errorCount > 0) {
    console.log(`   Errors:              ${results.errorCount}`);
    console.log('\n   Error Details:');
    results.errors.forEach(e => {
      console.log(`      - Item ${e.id}: ${e.error}`);
    });
  }
  console.log('');
  console.log(`   Time elapsed: ${elapsed}s`);
  console.log('='.repeat(80));
  console.log('\nMigration complete!\n');
}

// Run
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
