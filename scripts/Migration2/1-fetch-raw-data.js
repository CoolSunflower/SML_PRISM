/**
 * Step 1: Fetch all raw data from KWatch container and save locally
 * 
 * Run: npm run migrate:fetch
 * 
 * This script fetches all items from the raw KWatch container
 * and saves them to a local JSON file for testing and processing.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { kwatchContainer, kwatchProcessedContainer } = require('../config/database');

// ============================================================================
// CONFIGURATION
// ============================================================================
// Set to 'raw' to fetch from raw container, 'processed' to fetch from processed container
// Use 'processed' when you want to re-run classification with updated thresholds
const SOURCE = 'processed'; // 'raw' or 'processed'
// ============================================================================

// Output file paths
const RAW_OUTPUT_FILE = path.join(__dirname, 'data', 'raw-data.json');
const PROCESSED_OUTPUT_FILE = path.join(__dirname, 'data', 'processed-data.json');

// Configuration
const PAGE_SIZE = 250; // Fetch 250 items per page

/**
 * Get total count of items in the container
 * @param {object} container - Cosmos DB container
 * @returns {number} Total item count
 */
async function getTotalCount(container) {
  const countQuery = { query: 'SELECT VALUE COUNT(1) FROM c' };
  const { resources: countResult } = await container.items.query(countQuery).fetchAll();
  return countResult[0] || 0;
}

/**
 * Fetch a page of items using OFFSET/LIMIT
 * @param {object} container - Cosmos DB container
 * @param {number} offset - Starting position
 * @param {number} limit - Number of items to fetch
 * @returns {Array} Items for this page
 */
async function fetchPage(container, offset, limit) {
  const querySpec = {
    query: 'SELECT * FROM c ORDER BY c.receivedAt DESC OFFSET @offset LIMIT @limit',
    parameters: [
      { name: '@offset', value: offset },
      { name: '@limit', value: limit }
    ]
  };
  
  const { resources: items } = await container.items.query(querySpec).fetchAll();
  return items;
}

/**
 * Fetch all items from container with pagination
 * @param {object} container - Cosmos DB container
 * @param {string} sourceLabel - Label for logging ('raw' or 'processed')
 * @returns {Array} All items
 */
async function fetchAllItems(container, sourceLabel) {
  console.log(`Fetching all items from ${sourceLabel} container...\n`);
  
  // First, get total count
  console.log('   Counting total items...');
  const totalCount = await getTotalCount(container);
  console.log(`   Total items in container: ${totalCount}\n`);
  
  if (totalCount === 0) {
    return [];
  }
  
  const allItems = [];
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  
  for (let page = 1; page <= totalPages; page++) {
    const offset = (page - 1) * PAGE_SIZE;
    const items = await fetchPage(container, offset, PAGE_SIZE);
    allItems.push(...items);
    
    // Progress
    const progress = (page / totalPages * 100).toFixed(1);
    const barLength = 40;
    const filledLength = Math.round(barLength * page / totalPages);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    process.stdout.write(`\r   [${bar}] ${progress}% | Page ${page}/${totalPages} | Items: ${allItems.length}/${totalCount}`);

    // Small delay to avoid overwhelming the database (1 second)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n');
  return allItems;
}

/**
 * Main function
 */
async function main() {
  const startTime = Date.now();
  
  // Determine source container and output file
  const isProcessed = SOURCE === 'processed';
  const container = isProcessed ? kwatchProcessedContainer : kwatchContainer;
  const OUTPUT_FILE = isProcessed ? PROCESSED_OUTPUT_FILE : RAW_OUTPUT_FILE;
  const sourceLabel = isProcessed ? 'PROCESSED' : 'RAW';
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log(`║          Step 1: Fetch Data from KWatch ${sourceLabel.padEnd(9)} Container                  ║`);
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  if (isProcessed) {
    console.log('MODE: Fetching from PROCESSED container (for re-classification)\n');
  }
  
  try {
    // Fetch all items
    const items = await fetchAllItems(container, sourceLabel.toLowerCase());
    
    if (items.length === 0) {
      console.log(`\nNo items found in ${sourceLabel.toLowerCase()} container.\n`);
      return;
    }
    
    // Ensure data directory exists
    const dataDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`\nCreated directory: ${dataDir}`);
    }
    
    // Save to file
    console.log(`\nSaving ${items.length} items to: ${OUTPUT_FILE}`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(items, null, 2), 'utf-8');
    
    // File size info
    const stats = fs.statSync(OUTPUT_FILE);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    // Sample data preview
    console.log('\nSample item structure:');
    console.log(JSON.stringify(items[0], null, 2).split('\n').slice(0, 15).join('\n') + '\n   ...');
    
    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '='.repeat(80));
    console.log('FETCH COMPLETE\n');
    console.log(`   Items fetched:  ${items.length}`);
    console.log(`   File size:      ${fileSizeMB} MB`);
    console.log(`   Output file:    ${OUTPUT_FILE}`);
    console.log(`   Time elapsed:   ${elapsed}s`);
    console.log('='.repeat(80));
    console.log('\nNext step: Run "npm run migrate:test" to test classification\n');
    
  } catch (error) {
    console.error('\nError:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run
main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
