/**
 * Test script for Relevancy Classifier Integration
 * 
 * Tests:
 * 1. relevancyClassifier.js utility functions
 * 2. Integration flow with sample data
 * 
 * Usage: node test-relevancy-integration.js
 */

const path = require('path');

// Add parent directory to resolve imports
process.chdir(path.join(__dirname, '..'));

async function runTests() {
  console.log('='.repeat(80));
  console.log('RELEVANCY CLASSIFIER INTEGRATION TEST');
  console.log('='.repeat(80));

  // Test 1: Import the relevancy classifier
  console.log('\n[Test 1] Importing relevancyClassifier...');
  const { 
    initializeRelevancyClassifier, 
    classifyRelevancy, 
    isReady, 
    getStatus 
  } = require('../../utils/relevancyClassifier');
  console.log('  ✓ Import successful');

  // Test 2: Check initial status
  console.log('\n[Test 2] Checking initial status...');
  const initialStatus = getStatus();
  console.log('  Status:', JSON.stringify(initialStatus, null, 2));
  console.log(`  ✓ isReady: ${isReady()}`);

  // Test 3: Initialize the classifier
  console.log('\n[Test 3] Initializing classifier (this may take a moment)...');
  const startInit = Date.now();
  await initializeRelevancyClassifier();
  const initTime = ((Date.now() - startInit) / 1000).toFixed(2);
  console.log(`  ✓ Initialized in ${initTime}s`);

  // Test 4: Check status after init
  console.log('\n[Test 4] Checking status after initialization...');
  const postInitStatus = getStatus();
  console.log('  Status:', JSON.stringify(postInitStatus, null, 2));
  console.log(`  ✓ isReady: ${isReady()}`);

  // Test 5: Classify sample texts
  console.log('\n[Test 5] Classifying sample texts...');
  
  const testTexts = [
    // Should be RELEVANT (medical/Stryker related)
    "Just had my hip replacement surgery using Stryker implants. Recovery is going well!",
    "The Mako robotic arm system is revolutionary for knee surgery procedures.",
    "Medical devices from orthopedic companies are improving patient outcomes.",
    
    // Should be NOT RELEVANT
    "I love watching Netflix on weekends with my family.",
    "The weather today is beautiful, perfect for a picnic in the park.",
    "Just bought a new iPhone, the camera quality is amazing!",
  ];

  console.log('\n  Results:');
  console.log('  ' + '-'.repeat(70));
  
  for (const text of testTexts) {
    const result = await classifyRelevancy(text);
    const icon = result.isRelevant ? '✓' : '✗';
    const label = result.isRelevant ? 'RELEVANT' : 'NOT RELEVANT';
    const textPreview = text.length > 50 ? text.substring(0, 50) + '...' : text;
    console.log(`  ${icon} [${result.probability.toFixed(4)}] ${label.padEnd(12)} "${textPreview}"`);
  }

  // Test 6: Test extractSubTopicFromQuery function
  console.log('\n[Test 6] Testing extractSubTopicFromQuery logic...');
  
  function extractSubTopicFromQuery(query) {
    if (!query || typeof query !== 'string') return 'Unknown';
    const periodIndex = query.indexOf('.');
    if (periodIndex === -1) return query.trim();
    return query.substring(0, periodIndex).trim() || 'Unknown';
  }

  const queryTests = [
    { input: 'Stryker Hip Replacement. Medical devices', expected: 'Stryker Hip Replacement' },
    { input: 'Mako Surgery', expected: 'Mako Surgery' },
    { input: 'First sentence. Second. Third.', expected: 'First sentence' },
    { input: '', expected: 'Unknown' },
    { input: null, expected: 'Unknown' },
  ];

  for (const test of queryTests) {
    const result = extractSubTopicFromQuery(test.input);
    const passed = result === test.expected || (result === '' && test.expected === '');
    // Handle edge case where empty string might need to be 'Unknown'
    console.log(`  ${passed ? '✓' : '✗'} "${test.input}" -> "${result}"`);
  }

  // Test 7: Performance test
  console.log('\n[Test 7] Performance test (10 classifications)...');
  const perfStart = Date.now();
  const perfText = "Medical device innovation in orthopedic surgery.";
  
  for (let i = 0; i < 10; i++) {
    await classifyRelevancy(perfText);
  }
  
  const perfTime = Date.now() - perfStart;
  const avgTime = perfTime / 10;
  console.log(`  Total time: ${perfTime}ms`);
  console.log(`  Avg per classification: ${avgTime.toFixed(2)}ms`);
  console.log(`  Throughput: ${(1000 / avgTime).toFixed(1)} classifications/sec`);

  console.log('\n' + '='.repeat(80));
  console.log('ALL TESTS COMPLETE');
  console.log('='.repeat(80));
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
