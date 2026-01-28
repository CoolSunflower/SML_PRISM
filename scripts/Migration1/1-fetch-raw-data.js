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
const { kwatchContainer } = require('../config/database');

// Output file path
const OUTPUT_FILE = path.join(__dirname, 'data', 'raw-data.json');

// Configuration
const PAGE_SIZE = 200; // Fetch 100 items per page

/**
 * Get total count of items in the container
 * @returns {number} Total item count
 */
async function getTotalCount() {
  const countQuery = { query: 'SELECT VALUE COUNT(1) FROM c' };
  const { resources: countResult } = await kwatchContainer.items.query(countQuery).fetchAll();
  return countResult[0] || 0;
}

/**
 * Fetch a page of items using OFFSET/LIMIT
 * @param {number} offset - Starting position
 * @param {number} limit - Number of items to fetch
 * @returns {Array} Items for this page
 */
async function fetchPage(offset, limit) {
  const querySpec = {
    query: 'SELECT * FROM c ORDER BY c.receivedAt DESC OFFSET @offset LIMIT @limit',
    parameters: [
      { name: '@offset', value: offset },
      { name: '@limit', value: limit }
    ]
  };
  
  const { resources: items } = await kwatchContainer.items.query(querySpec).fetchAll();
  return items;
}

/**
 * Fetch all items from raw container with pagination
 * @returns {Array} All raw items
 */
async function fetchAllRawItems() {
  console.log('Fetching all items from raw container...\n');
  
  // First, get total count
  console.log('   Counting total items...');
  const totalCount = await getTotalCount();
  console.log(`   Total items in container: ${totalCount}\n`);
  
  if (totalCount === 0) {
    return [];
  }
  
  const allItems = [];
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  
  for (let page = 1; page <= totalPages; page++) {
    const offset = (page - 1) * PAGE_SIZE;
    const items = await fetchPage(offset, PAGE_SIZE);
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
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          Step 1: Fetch Raw Data from KWatch Container                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
  
  try {
    // Fetch all items
    const items = await fetchAllRawItems();
    
    if (items.length === 0) {
      console.log('\nNo items found in raw container.\n');
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
