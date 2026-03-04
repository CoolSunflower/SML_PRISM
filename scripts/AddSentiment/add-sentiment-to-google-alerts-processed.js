/**
 * One-time script: Add sentiment field to existing GoogleAlertsProcessedData items
 *
 * This script fetches all documents from the GoogleAlertsProcessedData container,
 * computes the sentiment for each item that is missing the `sentiment` field (or for
 * all items when --force is supplied), and replaces the document in Cosmos DB with the
 * computed value.
 *
 * Run:
 *   node scripts/AddSentiment/add-sentiment-to-google-alerts-processed.js
 *
 * Options:
 *   --force    Recompute and overwrite sentiment even on items that already have it
 *   --dry-run  Preview how many items would be updated without writing to the database
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const natural = require('natural');
const { googleAlertsProcessedContainer } = require('../../config/database');

const Analyzer = natural.SentimentAnalyzer;
const stemmer = natural.PorterStemmer;
const analyzer = new Analyzer('English', stemmer, 'afinn');

//  Configuration 

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');

const PAGE_SIZE = 250;       // Documents fetched per Cosmos DB query page
const BATCH_SIZE = 50;       // Documents updated concurrently per write batch
const DELAY_BETWEEN_BATCHES = 300; // ms pause between write batches to avoid RU throttling

//  Sentiment helper (mirrors utils/sentimentAnalyzer.js) 

function computeSentiment(text) {
  if (!text || typeof text !== 'string') return 'Neutral';
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'Neutral';
  const score = analyzer.getSentiment(tokens);
  if (score > 0) return 'Positive';
  if (score < 0) return 'Negative';
  return 'Neutral';
}

//  Database helpers 

async function getTotalCount() {
  const { resources } = await googleAlertsProcessedContainer.items
    .query('SELECT VALUE COUNT(1) FROM c')
    .fetchAll();
  return resources[0] || 0;
}

async function fetchPage(offset, limit) {
  const { resources } = await googleAlertsProcessedContainer.items
    .query({
      query: 'SELECT * FROM c ORDER BY c.classifiedAt DESC OFFSET @offset LIMIT @limit',
      parameters: [
        { name: '@offset', value: offset },
        { name: '@limit', value: limit },
      ],
    })
    .fetchAll();
  return resources;
}

async function updateItem(item) {
  // GoogleAlertsProcessedData uses /id as partition key
  await googleAlertsProcessedContainer.item(item.id, item.id).replace(item);
}

//  Main 

async function main() {
  const startTime = Date.now();

  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║        Add Sentiment to GoogleAlertsProcessedData (one-time migration)        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  if (DRY_RUN) console.log('MODE: DRY RUN — no changes will be written to the database\n');
  if (FORCE)   console.log('MODE: FORCE — recomputing sentiment for all items (including those already set)\n');

  // Count total items
  console.log('Counting total items in GoogleAlertsProcessedData...');
  const totalCount = await getTotalCount();
  console.log(`   Total items: ${totalCount}\n`);

  if (totalCount === 0) {
    console.log('No items found. Nothing to do.\n');
    return;
  }

  // Fetch all items with pagination
  console.log(`Fetching all items (page size: ${PAGE_SIZE})...`);
  const allItems = [];
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  for (let page = 1; page <= totalPages; page++) {
    const offset = (page - 1) * PAGE_SIZE;
    const items = await fetchPage(offset, PAGE_SIZE);
    allItems.push(...items);

    const pct = (page / totalPages * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(40 * page / totalPages)) + '░'.repeat(40 - Math.round(40 * page / totalPages));
    process.stdout.write(`\r   [${bar}] ${pct}% | Page ${page}/${totalPages} | Fetched: ${allItems.length}`);

    await new Promise(r => setTimeout(r, 500)); // throttle reads
  }
  console.log('\n');

  // Determine which items need updating
  const itemsToUpdate = allItems.filter(item => FORCE || item.sentiment === undefined || item.sentiment === null);
  console.log(`Items requiring sentiment update: ${itemsToUpdate.length} of ${allItems.length}`);

  if (itemsToUpdate.length === 0) {
    console.log('\nAll items already have a sentiment value. Use --force to recompute.\n');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — would update the following item IDs (first 10):');
    itemsToUpdate.slice(0, 10).forEach(item => console.log(`   ${item.id}`));
    if (itemsToUpdate.length > 10) console.log(`   ... and ${itemsToUpdate.length - 10} more`);
    console.log('\nRe-run without --dry-run to apply changes.\n');
    return;
  }

  // Write updates in concurrent batches
  console.log(`\nUpdating ${itemsToUpdate.length} items (batch size: ${BATCH_SIZE})...\n`);

  let updated = 0;
  let errors = 0;
  const errorDetails = [];

  for (let i = 0; i < itemsToUpdate.length; i += BATCH_SIZE) {
    const batch = itemsToUpdate.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      batch.map(async item => {
        const sentiment = computeSentiment(item.content);
        return updateItem({ ...item, sentiment });
      })
    );

    for (let j = 0; j < results.length; j++) {
      if (results[j].status === 'fulfilled') {
        updated++;
      } else {
        errors++;
        errorDetails.push({ id: batch[j].id, error: results[j].reason?.message });
      }
    }

    const processed = Math.min(i + BATCH_SIZE, itemsToUpdate.length);
    const pct = (processed / itemsToUpdate.length * 100).toFixed(1);
    const filled = Math.round(40 * processed / itemsToUpdate.length);
    const bar = '█'.repeat(filled) + '░'.repeat(40 - filled);
    process.stdout.write(`\r   [${bar}] ${pct}% | Updated: ${updated} | Errors: ${errors}`);

    if (i + BATCH_SIZE < itemsToUpdate.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }
  }

  console.log('\n');

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('='.repeat(80));
  console.log('MIGRATION COMPLETE\n');
  console.log(`   Total items in container: ${allItems.length}`);
  console.log(`   Items updated:            ${updated}`);
  console.log(`   Errors:                   ${errors}`);
  console.log(`   Skipped (already set):    ${allItems.length - itemsToUpdate.length}`);
  console.log(`   Time elapsed:             ${elapsed}s`);

  if (errors > 0) {
    console.log('\n   Error details (first 20):');
    errorDetails.slice(0, 20).forEach(e => console.log(`      - ${e.id}: ${e.error}`));
  }

  console.log('='.repeat(80));
  console.log('\nMigration complete!\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('\nFatal error:', err);
    process.exit(1);
  });
