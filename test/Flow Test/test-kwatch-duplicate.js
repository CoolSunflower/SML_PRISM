/**
 * Test script for KWatch duplicate handling
 * Sends the same payload twice and verifies:
 * 1) Two items exist in raw container
 * 2) IDs are different
 * 3) One item has isDuplicate=true
 */

// const BASE_URL = 'https://social-media-listening-ahawbrhza5ewc4au.eastus-01.azurewebsites.net';
const BASE_URL = 'http://localhost:3000';
const WAIT_MS = 80000; // default: 80s (>= BATCH_INTERVAL)
const SEPARATE_BATCH_WAIT_MS = 65000; // > 60s
const PROCESSED_WAIT_MS = 120000; // 2 minutes
const REQUIRED_CONTENT = 'The Mako robotic arm system is revolutionary for knee surgery procedures.';
const EXPECTED_TOPIC = 'General-RelevancyClassification';
const EXPECTED_SUBTOPIC = 'prodense stryker';
const EXPECTED_QUERY_NAME = 'RelevancyClassification';
const EXPECTED_INTERNAL_ID = '74747474747474747474747474747474';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendPayload(payload) {
  const response = await fetch(`${BASE_URL}/api/webhook/kwatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseData = await response.json();
  return { status: response.status, data: responseData };
}

async function fetchRecentItems(limit = 50) {
  const response = await fetch(`${BASE_URL}/api/kwatch?limit=${limit}&page=1`);
  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.status}`);
  }
  const data = await response.json();
  return data.items || [];
}

async function fetchProcessedItems(limit = 50) {
  const response = await fetch(`${BASE_URL}/api/kwatch/processed?limit=${limit}&page=1`);
  if (!response.ok) {
    throw new Error(`Failed to fetch processed items: ${response.status}`);
  }
  const data = await response.json();
  return data.items || [];
}

function logCaseHeader(title) {
  console.log('\n' + '-'.repeat(50));
  console.log(title);
  console.log('-'.repeat(50));
}

async function verifyCaseMatches(label, author, minCount, requireDuplicate) {
  const items = await fetchRecentItems(200);
  const matches = items.filter(item => item.author === author);

  console.log(`\n[${label}] Found ${matches.length} matching items in raw container`);

  if (matches.length < minCount) {
    console.log(`✗ [${label}] Expected at least ${minCount} items`);
    process.exitCode = 1;
    return false;
  }

  const ids = new Set(matches.map(item => item.id));
  const duplicateCount = matches.filter(item => item.isDuplicate === true).length;

  if (ids.size < minCount) {
    console.log(`✗ [${label}] Expected different IDs for duplicate items`);
    process.exitCode = 1;
    return false;
  }

  if (requireDuplicate && duplicateCount < 1) {
    console.log(`✗ [${label}] Expected at least one item with isDuplicate=true`);
    process.exitCode = 1;
    return false;
  }

  console.log(`✓ [${label}] PASSED`);
  console.log(`[${label}] Sample items:`, matches.map(i => ({ id: i.id, isDuplicate: i.isDuplicate })));
  return matches;
}

async function verifyProcessedMatches(label, author, rawMatches, minCount, requireDuplicate) {
  const items = await fetchProcessedItems(200);
  const matches = items.filter(item => item.author === author);

  console.log(`\n[${label}] Found ${matches.length} matching items in processed container`);

  if (matches.length < minCount) {
    console.log(`✗ [${label}] Expected at least ${minCount} processed items`);
    process.exitCode = 1;
    return false;
  }

  const rawById = new Map(rawMatches.map(item => [item.id, item]));
  const ids = new Set(matches.map(item => item.id));
  const duplicateCount = matches.filter(item => item.isDuplicate === true).length;

  if (ids.size < minCount) {
    console.log(`✗ [${label}] Expected different IDs for processed items`);
    process.exitCode = 1;
    return false;
  }

  if (requireDuplicate && duplicateCount < 1) {
    console.log(`✗ [${label}] Expected at least one processed item with isDuplicate=true`);
    process.exitCode = 1;
    return false;
  }

  for (const item of matches) {
    const rawItem = rawById.get(item.id);
    if (!rawItem) {
      console.log(`✗ [${label}] Processed item ${item.id} not found in raw matches`);
      process.exitCode = 1;
      return false;
    }

    if (rawItem.isDuplicate !== item.isDuplicate) {
      console.log(`✗ [${label}] isDuplicate mismatch for ${item.id} (raw: ${rawItem.isDuplicate}, processed: ${item.isDuplicate})`);
      process.exitCode = 1;
      return false;
    }

    if (item.topic !== EXPECTED_TOPIC) {
      console.log(`✗ [${label}] topic mismatch for ${item.id} (got: ${item.topic})`);
      process.exitCode = 1;
      return false;
    }

    if (item.subTopic !== EXPECTED_SUBTOPIC) {
      console.log(`✗ [${label}] subTopic mismatch for ${item.id} (got: ${item.subTopic})`);
      process.exitCode = 1;
      return false;
    }

    if (item.queryName !== EXPECTED_QUERY_NAME) {
      console.log(`✗ [${label}] queryName mismatch for ${item.id} (got: ${item.queryName})`);
      process.exitCode = 1;
      return false;
    }

    if (item.internalId !== EXPECTED_INTERNAL_ID) {
      console.log(`✗ [${label}] internalId mismatch for ${item.id} (got: ${item.internalId})`);
      process.exitCode = 1;
      return false;
    }
  }

  console.log(`✓ [${label}] Processed container check PASSED`);
  console.log(`[${label}] Processed sample items:`, matches.map(i => ({ id: i.id, isDuplicate: i.isDuplicate })));
  return matches;
}

async function testDuplicateHandling() {
  console.log('Testing KWatch Duplicate Handling');
  console.log('='.repeat(50));
  console.log(`Target: ${BASE_URL}/api/webhook/kwatch`);
  console.log(`Wait time: ${WAIT_MS}ms`);
  console.log('');

  const basePayload = {
    platform: 'twitter',
    query: 'prodense stryker',
    datetime: new Date().toISOString(),
    sentiment: 'neutral',
    content: REQUIRED_CONTENT,
    title: 'Mako Robot'
  };

  // Case 1: Same batch (send duplicates back-to-back)
  logCaseHeader('Case 1: Same batch duplicates');
  const uniqueMarkerBatch = `dup-samebatch-${Date.now()}`;
  const payloadSameBatch = {
    ...basePayload,
    content: `${REQUIRED_CONTENT} (unique marker: ${uniqueMarkerBatch})`,
    link: `https://twitter.com/test/status/${uniqueMarkerBatch}`,
    author: `test_user_${uniqueMarkerBatch}`,
  };

  console.log('Sending payload #1 (same batch)');
  const sameBatchFirst = await sendPayload(payloadSameBatch);
  console.log(`Response #1: ${sameBatchFirst.status}`, sameBatchFirst.data);

  console.log('Sending payload #2 (same batch duplicate)');
  const sameBatchSecond = await sendPayload(payloadSameBatch);
  console.log(`Response #2: ${sameBatchSecond.status}`, sameBatchSecond.data);

  if (sameBatchFirst.status !== 200 || sameBatchSecond.status !== 200) {
    console.log('\n✗ Webhook requests failed for same batch');
    process.exitCode = 1;
    return;
  }

  console.log(`\nWaiting ${WAIT_MS}ms for queue processing...`);
  await sleep(WAIT_MS);

  const sameBatchRaw = await verifyCaseMatches('Same batch', payloadSameBatch.author, 2, true);

  if (sameBatchRaw) {
    console.log(`\nWaiting ${PROCESSED_WAIT_MS}ms before checking processed container...`);
    await sleep(PROCESSED_WAIT_MS);
    await verifyProcessedMatches('Same batch', payloadSameBatch.author, sameBatchRaw, 2, true);
  }

  // Case 2: Separate batches (send one, wait > batch interval, then send duplicate)
  logCaseHeader('Case 2: Separate batch duplicates');
  const uniqueMarkerSeparate = `dup-separatebatch-${Date.now()}`;
  const payloadSeparateBatch = {
    ...basePayload,
    content: `${REQUIRED_CONTENT} (unique marker: ${uniqueMarkerSeparate})`,
    link: `https://twitter.com/test/status/${uniqueMarkerSeparate}`,
    author: `test_user_${uniqueMarkerSeparate}`,
    title: 'Mako Robot'
  };

  console.log('Sending payload #1 (separate batch)');
  const separateFirst = await sendPayload(payloadSeparateBatch);
  console.log(`Response #1: ${separateFirst.status}`, separateFirst.data);

  if (separateFirst.status !== 200) {
    console.log('\n✗ Webhook request failed for separate batch (first)');
    process.exitCode = 1;
    return;
  }

  console.log(`\nWaiting ${SEPARATE_BATCH_WAIT_MS}ms to force a new batch...`);
  await sleep(SEPARATE_BATCH_WAIT_MS);

  console.log('Sending payload #2 (separate batch duplicate)');
  const separateSecond = await sendPayload(payloadSeparateBatch);
  console.log(`Response #2: ${separateSecond.status}`, separateSecond.data);

  if (separateSecond.status !== 200) {
    console.log('\n✗ Webhook request failed for separate batch (second)');
    process.exitCode = 1;
    return;
  }

  console.log(`\nWaiting ${WAIT_MS}ms for queue processing...`);
  await sleep(WAIT_MS);

  const separateBatchRaw = await verifyCaseMatches('Separate batch', payloadSeparateBatch.author, 2, true);

  if (separateBatchRaw) {
    console.log(`\nWaiting ${PROCESSED_WAIT_MS}ms before checking processed container...`);
    await sleep(PROCESSED_WAIT_MS);
    await verifyProcessedMatches('Separate batch', payloadSeparateBatch.author, separateBatchRaw, 2, true);
  }
}

testDuplicateHandling().catch(err => {
  console.error('Test failed with error:', err.message);
  process.exitCode = 1;
});
