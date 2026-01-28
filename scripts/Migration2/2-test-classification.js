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
const { initializeRelevancyClassifier, classifyRelevancy, isReady: isRelevancyReady } = require('../utils/relevancyClassifier');

// ============================================================================
// CONFIGURATION
// ============================================================================
// INPUT_SOURCE options:
//   'raw'       - Use raw-data.json (fetched from raw container)
//   'processed' - Use processed-data.json (fetched from processed container, for re-classification)
//   'filtered'  - Use sampleMatched from classification-results.json (previous run)
const INPUT_SOURCE = 'processed'; // 'raw', 'processed', or 'filtered'
// ============================================================================

// Input file paths
const RAW_INPUT_FILE = path.join(__dirname, 'data', 'raw-data.json');
const PROCESSED_INPUT_FILE = path.join(__dirname, 'data', 'processed-data.json');
const FILTERED_INPUT_FILE = path.join(__dirname, 'data', 'classification-results.json');

// Results file paths
const RESULTS_FILE = path.join(__dirname, 'data', 'classification-results.json');
const PROCESSED_RESULTS_FILE = path.join(__dirname, 'data', 'classification-results-processed.json');
const FILTERED_RESULTS_FILE = path.join(__dirname, 'data', 'classification-results-filtered.json');

/**
 * Extract subTopic from query string (same as kwatchQueue.js)
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
 * Classify a single item (without pushing to database)
 * Uses brand classification first, then relevancy as fallback (same as kwatchQueue.js)
 * @param {Object} item - Raw KWatch item
 * @returns {Promise<Object>} Classification result
 */
async function classifyItem(item) {
  try {
    // Combine title + content for classification
    const textToClassify = `${item.title || ''} ${item.content || ''}`;
    const classificationResult = classifyText(textToClassify);
    
    // Step 1: Try brand classification first
    if (classificationResult.matched) {
      const classification = classificationResult.classification;
      
      // For brand-matched items, also run relevancy classification
      const relevancyResult = await classifyRelevancy(textToClassify);
      
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
        relevantByModel: relevancyResult.isRelevant,
        // Migration metadata
        migratedAt: '[WILL BE SET ON ACTUAL MIGRATION]',
      };
      
      return {
        status: 'matched',
        method: 'BrandQuery',
        id: item.id,
        classification,
        relevancyResult,
        processedDocument
      };
    }
    
    // Step 2: If brand classification didn't match, try relevancy classification as fallback
    if (isRelevancyReady()) {
      const relevancyResult = await classifyRelevancy(textToClassify);
      
      if (relevancyResult.isRelevant) {
        const subTopic = extractSubTopicFromQuery(item.query);
        
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
          // Relevancy classification results (same as kwatchQueue.js)
          topic: 'General-RelevancyClassification',
          subTopic: subTopic,
          queryName: 'RelevancyClassification',
          internalId: '74747474747474747474747474747474',
          relevantByModel: true,
          // Migration metadata
          migratedAt: '[WILL BE SET ON ACTUAL MIGRATION]',
        };
        
        return {
          status: 'matched',
          method: 'RelevancyModel',
          id: item.id,
          relevancyResult,
          processedDocument
        };
      }
    }
    
    // No match from either classification method
    return {
      status: 'no-match',
      id: item.id,
      textPreview: textToClassify.substring(0, 200) + '...'
    };
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
  let inputFile, outputFile, modeLabel;
  
  switch (INPUT_SOURCE) {
    case 'processed':
      inputFile = PROCESSED_INPUT_FILE;
      outputFile = PROCESSED_RESULTS_FILE;
      modeLabel = 'PROCESSED DATA';
      break;
    case 'filtered':
      inputFile = FILTERED_INPUT_FILE;
      outputFile = FILTERED_RESULTS_FILE;
      modeLabel = 'FILTERED SUBSET';
      break;
    case 'raw':
    default:
      inputFile = RAW_INPUT_FILE;
      outputFile = RESULTS_FILE;
      modeLabel = 'RAW DATA';
      break;
  }
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║          Step 2: Test Classification (DRY RUN) - ${modeLabel.padEnd(17)}        ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    if (INPUT_SOURCE === 'filtered') {
      console.error('   Please run with INPUT_SOURCE="raw" or "processed" first\n');
    } else if (INPUT_SOURCE === 'processed') {
      console.error('   Please run "npm run migrate:fetch" with SOURCE="processed" first\n');
    } else {
      console.error('   Please run "npm run migrate:fetch" first.\n');
    }
    process.exit(1);
  }
  
  // Load data
  console.log(`Loading data from: ${inputFile}`);
  let items;
  
  if (INPUT_SOURCE === 'filtered') {
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
  
  // Initialize classifiers
  console.log('Initializing Brand Classifier...');
  const classifierInit = await initializeBrandClassifier();
  if (!classifierInit.success) {
    console.error(`Brand Classifier initialization failed: ${classifierInit.error}`);
    process.exit(1);
  }
  console.log(`Brand Classifier ready with ${classifierInit.queryCount} queries`);
  
  console.log('Initializing Relevancy Classifier...');
  try {
    await initializeRelevancyClassifier();
    console.log('Relevancy Classifier ready\n');
  } catch (err) {
    console.error(`Relevancy Classifier initialization failed: ${err.message}`);
    console.error('Continuing without relevancy classification fallback...\n');
  }
  
  // Process all items
  console.log('Running classification on all items...\n');
  
  const results = {
    matched: [],
    noMatch: [],
    errors: []
  };
  
  // Statistics by topic and method
  const topicStats = {};
  const methodStats = { BrandQuery: 0, RelevancyModel: 0 };
  
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const result = await classifyItem(item);
    
    if (result.status === 'matched') {
      results.matched.push(result);
      
      // Track method statistics
      if (result.method) {
        methodStats[result.method]++;
      }
      
      // Track topic statistics
      const topic = result.processedDocument.topic;
      if (!topicStats[topic]) {
        topicStats[topic] = { count: 0, subTopics: {} };
      }
      topicStats[topic].count++;
      
      const subTopic = result.processedDocument.subTopic;
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
    if ((index + 1) % 100 === 0 || index === items.length - 1) {
      const pct = ((index + 1) / items.length * 100).toFixed(1);
      process.stdout.write(`\r   Processed: ${index + 1}/${items.length} (${pct}%) | Brand: ${methodStats.BrandQuery} | Relevancy: ${methodStats.RelevancyModel}`);
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
      errors: results.errors.length,
      byMethod: methodStats
    },
    topicStats,
    // Only save first 10 of each for preview
    sampleMatched: results.matched,
    sampleNoMatch: INPUT_SOURCE === 'filtered' ? results.noMatch : results.noMatch.slice(0, 10),
    errors: results.errors
  }, null, 2), 'utf-8');
  
  // Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n' + '='.repeat(80));
  console.log('CLASSIFICATION TEST RESULTS\n');
  console.log(`   Total Items:        ${items.length}`);
  console.log(`   Matched:            ${results.matched.length} (${(results.matched.length/items.length*100).toFixed(1)}%)`);
  console.log(`      - Brand Query:   ${methodStats.BrandQuery}`);
  console.log(`      - Relevancy:     ${methodStats.RelevancyModel}`);
  console.log(`   No Match:           ${results.noMatch.length} (${(results.noMatch.length/items.length*100).toFixed(1)}%)`);
  if (results.errors.length > 0) {
    console.log(`   Errors:             ${results.errors.length} (${(results.errors.length/items.length*100).toFixed(1)}%)`);
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
    if (INPUT_SOURCE === 'filtered') {
      console.log('Running in FILTERED SUBSET mode - results saved to classification-results-filtered.json\n');
    } else if (INPUT_SOURCE === 'processed') {
      console.log('Running in PROCESSED DATA mode - results saved to classification-results-processed.json');
      console.log('Next step: Run "npm run migrate:push" with INPUT_SOURCE="processed" to re-push items\n');
    } else {
      console.log('Next step: Run "npm run migrate:push" to push matched items to database\n');
    }
  } else {
    console.log('\nSome items had errors. Review before proceeding.\n');
  }
}

// Run
main().catch(console.error);
