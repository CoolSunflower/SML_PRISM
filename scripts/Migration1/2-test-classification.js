/**
 * Step 2: Test classification on local data (DRY RUN - no database writes)
 * 
 * Run: npm run migrate:test
 * 
 * This script loads the locally saved raw data and runs classification
 * on all items WITHOUT pushing to the database. This allows you to:
 * - Verify the classification is working correctly
 * - See what percentage of items will match
 * - Preview the processed document structure
 * - Catch any errors before the actual migration
 */

const fs = require('fs');
const path = require('path');
const { initializeBrandClassifier, classifyText } = require('../services/brandClassifier');

// ============================================================================
// CONFIGURATION
// ============================================================================
// Set to true to re-run classification on previously matched items only
// (uses sampleMatched from classification-results.json instead of raw-data.json)
const USE_FILTERED_SUBSET = true;
// ============================================================================

// Input file path (output from step 1)
const INPUT_FILE = path.join(__dirname, 'data', 'raw-data.json');
// Previous classification results (used when USE_FILTERED_SUBSET is true)
const FILTERED_INPUT_FILE = path.join(__dirname, 'data', 'classification-results.json');
// Results file path
const RESULTS_FILE = path.join(__dirname, 'data', 'classification-results.json');
// Filtered results file path (used when USE_FILTERED_SUBSET is true)
const FILTERED_RESULTS_FILE = path.join(__dirname, 'data', 'classification-results-filtered.json');

/**
 * Classify a single item (without pushing to database)
 * @param {Object} item - Raw KWatch item
 * @returns {Object} Classification result
 */
function classifyItem(item) {
  try {
    // Combine title + content for classification
    const textToClassify = `${item.title || ''} ${item.content || ''}`;
    const classificationResult = classifyText(textToClassify);
    
    if (classificationResult.matched) {
      const classification = classificationResult.classification;
      
      // Build the processed document (same structure as actual migration)
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
        migratedAt: '[WILL BE SET ON ACTUAL MIGRATION]',
      };
      
      return {
        status: 'matched',
        id: item.id,
        classification,
        processedDocument
      };
    } else {
      return {
        status: 'no-match',
        id: item.id,
        textPreview: textToClassify.substring(0, 200) + '...'
      };
    }
  } catch (err) {
    return {
      status: 'error',
      id: item.id,
      error: err.message
    };
  }
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();
  
  // Determine which mode we're running in
  const inputFile = USE_FILTERED_SUBSET ? FILTERED_INPUT_FILE : INPUT_FILE;
  const outputFile = USE_FILTERED_SUBSET ? FILTERED_RESULTS_FILE : RESULTS_FILE;
  const modeLabel = USE_FILTERED_SUBSET ? 'FILTERED SUBSET' : 'FULL DATA';
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║          Step 2: Test Classification (DRY RUN) - ${modeLabel.padEnd(17)}        ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    if (USE_FILTERED_SUBSET) {
      console.error('   Please run with USE_FILTERED_SUBSET=false first to generate classification-results.json\n');
    } else {
      console.error('   Please run "npm run migrate:fetch" first.\n');
    }
    process.exit(1);
  }
  
  // Load data
  console.log(`Loading data from: ${inputFile}`);
  let items;
  
  if (USE_FILTERED_SUBSET) {
    // Load from previous classification results - extract processedDocument from sampleMatched
    const previousResults = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    if (!previousResults.sampleMatched || !Array.isArray(previousResults.sampleMatched)) {
      console.error('   Invalid classification-results.json: missing sampleMatched array\n');
      process.exit(1);
    }
    // Extract the processedDocument from each matched item to use as input
    items = previousResults.sampleMatched.map(match => match.processedDocument);
    console.log(`   Loaded ${items.length} previously matched items from sampleMatched\n`);
  } else {
    items = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
    console.log(`   Loaded ${items.length} items\n`);
  }
  
  // Initialize classifier
  console.log('Initializing Brand Classifier...');
  const classifierInit = await initializeBrandClassifier();
  if (!classifierInit.success) {
    console.error(`Brand Classifier initialization failed: ${classifierInit.error}`);
    process.exit(1);
  }
  console.log(`Classifier ready with ${classifierInit.queryCount} queries\n`);
  
  // Process all items
  console.log('Running classification on all items...\n');
  
  const results = {
    matched: [],
    noMatch: [],
    errors: []
  };
  
  // Statistics by topic
  const topicStats = {};
  
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const result = classifyItem(item);
    
    if (result.status === 'matched') {
      results.matched.push(result);
      
      // Track topic statistics
      const topic = result.classification.topic;
      if (!topicStats[topic]) {
        topicStats[topic] = { count: 0, subTopics: {} };
      }
      topicStats[topic].count++;
      
      const subTopic = result.classification.subTopic;
      if (!topicStats[topic].subTopics[subTopic]) {
        topicStats[topic].subTopics[subTopic] = 0;
      }
      topicStats[topic].subTopics[subTopic]++;
      
    } else if (result.status === 'no-match') {
      results.noMatch.push(result);
    } else {
      results.errors.push(result);
    }
    
    // Progress indicator
    if ((index + 1) % 500 === 0 || index === items.length - 1) {
      const pct = ((index + 1) / items.length * 100).toFixed(1);
      process.stdout.write(`\r   Processed: ${index + 1}/${items.length} (${pct}%)`);
    }
  }
  
  console.log('\n');
  
  // Save results
  console.log(`Saving results to: ${outputFile}`);
  fs.writeFileSync(outputFile, JSON.stringify({
    summary: {
      total: items.length,
      matched: results.matched.length,
      noMatch: results.noMatch.length,
      errors: results.errors.length
    },
    topicStats,
    // Only save first 10 of each for preview
    sampleMatched: results.matched,
    sampleNoMatch: USE_FILTERED_SUBSET ? results.noMatch : results.noMatch.slice(0, 10),
    errors: results.errors
  }, null, 2), 'utf-8');
  
  // Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(80));
  console.log('CLASSIFICATION TEST RESULTS\n');
  console.log(`   Total Items:        ${items.length}`);
  console.log(`   Matched:          ${results.matched.length} (${(results.matched.length/items.length*100).toFixed(1)}%)`);
  console.log(`   No Match:         ${results.noMatch.length} (${(results.noMatch.length/items.length*100).toFixed(1)}%)`);
  if (results.errors.length > 0) {
    console.log(`   Errors:           ${results.errors.length} (${(results.errors.length/items.length*100).toFixed(1)}%)`);
  }
  console.log('');
  
  // Print topic breakdown
  console.log('BREAKDOWN BY TOPIC:\n');
  Object.keys(topicStats).sort().forEach(topic => {
    const stat = topicStats[topic];
    console.log(`   ${topic}: ${stat.count} items`);
    Object.keys(stat.subTopics).sort().forEach(subTopic => {
      console.log(`      - ${subTopic}: ${stat.subTopics[subTopic]}`);
    });
  });
  
  // Sample matched item
  if (results.matched.length > 0) {
    console.log('\nSAMPLE MATCHED ITEM:');
    console.log(JSON.stringify(results.matched[0].processedDocument, null, 2).split('\n').map(l => '   ' + l).join('\n'));
  }
  
  // Show errors if any
  if (results.errors.length > 0) {
    console.log('\nERRORS:');
    results.errors.forEach(err => {
      console.log(`   - Item ${err.id}: ${err.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`   Time elapsed: ${elapsed}s`);
  console.log(`   Results saved to: ${outputFile}`);
  console.log('='.repeat(80));
  
  if (results.errors.length === 0) {
    console.log('\nAll items processed successfully!');
    if (USE_FILTERED_SUBSET) {
      console.log('Running in FILTERED SUBSET mode - results saved to classification-results-filtered.json\n');
    } else {
      console.log('Next step: Run "npm run migrate:push" to push matched items to database\n');
    }
  } else {
    console.log('\nSome items had errors. Review before proceeding.\n');
  }
}

// Run
main().catch(console.error);
