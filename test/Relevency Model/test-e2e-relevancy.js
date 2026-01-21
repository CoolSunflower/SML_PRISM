/**
 * End-to-End Test for Relevancy Classification Flow
 * 
 * Tests:
 * 1. Brand classifier - should NOT match (no brand query for this text)
 * 2. Relevancy classifier - should match (relevant medical content)
 * 3. KWatch webhook endpoint - full flow test
 * 
 * Usage: node test-e2e-relevancy.js
 */

const path = require('path');

// Change to backend directory for proper imports
process.chdir(path.join(__dirname, '..', '..'));

// Test cases
const TEST_CASES = [
  {
    name: 'Relevant (Relevancy Model)',
    text: "The Mako robotic arm system is revolutionary for knee surgery procedures.",
    expectedBrand: false,
    expectedRelevancy: true,
    description: 'Medical/surgical content - should be caught by relevancy model'
  },
  {
    name: 'Not Relevant (Neither)',
    text: "Just finished watching the new Marvel movie with my friends. The popcorn was amazing and the special effects were incredible!",
    expectedBrand: false,
    expectedRelevancy: false,
    description: 'Completely unrelated content - should be missed by both classifiers'
  }
];

async function runTests() {
  console.log('='.repeat(80));
  console.log('END-TO-END RELEVANCY CLASSIFICATION TEST');
  console.log('='.repeat(80));

  // Initialize classifiers once
  const { initializeBrandClassifier, classifyText, getClassifierStatus } = require('../../services/brandClassifier');
  const { initializeRelevancyClassifier, classifyRelevancy, getStatus } = require('../../utils/relevancyClassifier');

  console.log('\n[SETUP] Initializing classifiers...');
  
  await initializeBrandClassifier();
  const brandStatus = getClassifierStatus();
  console.log(`  ✓ Brand classifier ready (${brandStatus.queryCount} queries loaded)`);

  await initializeRelevancyClassifier();
  const relevancyStatus = getStatus();
  console.log(`  ✓ Relevancy classifier ready (threshold: ${relevancyStatus.config?.threshold?.toFixed(4)})`);

  // Track results
  const results = [];

  // Run each test case
  for (let i = 0; i < TEST_CASES.length; i++) {
    const testCase = TEST_CASES[i];
    console.log('\n' + '='.repeat(80));
    console.log(`[TEST CASE ${i + 1}] ${testCase.name}`);
    console.log('='.repeat(80));
    console.log(`\nText: "${testCase.text}"`);
    console.log(`Description: ${testCase.description}`);

    // Test 1: Brand Classifier
    console.log('\n' + '-'.repeat(60));
    console.log('Brand Classifier Check');
    console.log('-'.repeat(60));
    
    const brandResult = classifyText(testCase.text);
    const brandMatched = brandResult.matched;
    const brandCorrect = brandMatched === testCase.expectedBrand;
    
    console.log(`  Result: matched=${brandMatched}`);
    if (brandMatched) {
      console.log(`  Classification: ${brandResult.classification.topic}/${brandResult.classification.subTopic}`);
    }
    console.log(`  Expected: ${testCase.expectedBrand}`);
    console.log(`  ${brandCorrect ? '✓ PASS' : '✗ FAIL'}`);

    // Test 2: Relevancy Classifier
    console.log('\n' + '-'.repeat(60));
    console.log('Relevancy Classifier Check');
    console.log('-'.repeat(60));
    
    const relevancyResult = await classifyRelevancy(testCase.text);
    const relevancyMatched = relevancyResult.isRelevant;
    const relevancyCorrect = relevancyMatched === testCase.expectedRelevancy;
    
    console.log(`  Result: isRelevant=${relevancyMatched}, probability=${relevancyResult.probability}`);
    console.log(`  Expected: ${testCase.expectedRelevancy}`);
    console.log(`  ${relevancyCorrect ? '✓ PASS' : '✗ FAIL'}`);

    // Determine what would happen in the queue
    console.log('\n' + '-'.repeat(60));
    console.log('Queue Processing Outcome');
    console.log('-'.repeat(60));
    
    let outcome;
    if (brandMatched) {
      outcome = 'BRAND_CLASSIFIED';
      console.log('  → Will be classified by Brand Classifier');
      console.log(`  → Topic: ${brandResult.classification.topic}`);
      console.log(`  → SubTopic: ${brandResult.classification.subTopic}`);
    } else if (relevancyMatched) {
      outcome = 'RELEVANCY_CLASSIFIED';
      console.log('  → Brand classifier: NO MATCH');
      console.log('  → Will be classified by Relevancy Model as RELEVANT');
      console.log('  → Topic: "General"');
      console.log('  → queryName: "RelevancyClassification"');
    } else {
      outcome = 'NOT_CLASSIFIED';
      console.log('  → Brand classifier: NO MATCH');
      console.log('  → Relevancy classifier: NOT RELEVANT');
      console.log('  → Will NOT be pushed to processed container');
    }

    results.push({
      name: testCase.name,
      brandCorrect,
      relevancyCorrect,
      outcome,
      allPassed: brandCorrect && relevancyCorrect
    });
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST SUMMARY');
  console.log('='.repeat(80));
  
  let allPassed = true;
  for (const result of results) {
    const icon = result.allPassed ? '✓' : '✗';
    console.log(`\n  ${icon} ${result.name}`);
    console.log(`    Brand: ${result.brandCorrect ? 'PASS' : 'FAIL'}`);
    console.log(`    Relevancy: ${result.relevancyCorrect ? 'PASS' : 'FAIL'}`);
    console.log(`    Outcome: ${result.outcome}`);
    if (!result.allPassed) allPassed = false;
  }

  console.log('\n' + '='.repeat(80));
  if (allPassed) {
    console.log('ALL TESTS PASSED ✓');
    console.log('='.repeat(80));
    console.log(`
WEBHOOK TEST COMMANDS:

1. Test RELEVANT content (will be classified by Relevancy Model):

curl -X POST http://localhost:3000/api/webhook/kwatch ^
  -H "Content-Type: application/json" ^
  -d "{\\"platform\\": \\"twitter\\", \\"query\\": \\"Mako Surgery Test. Integration\\", \\"datetime\\": \\"${new Date().toISOString()}\\", \\"link\\": \\"https://test.com/1\\", \\"author\\": \\"test_user\\", \\"title\\": \\"Test\\", \\"content\\": \\"${TEST_CASES[0].text}\\", \\"sentiment\\": \\"positive\\"}"

2. Test NOT RELEVANT content (will NOT be classified):

curl -X POST http://localhost:3000/api/webhook/kwatch ^
  -H "Content-Type: application/json" ^
  -d "{\\"platform\\": \\"twitter\\", \\"query\\": \\"Random Test. Nothing\\", \\"datetime\\": \\"${new Date().toISOString()}\\", \\"link\\": \\"https://test.com/2\\", \\"author\\": \\"test_user\\", \\"title\\": \\"Test\\", \\"content\\": \\"${TEST_CASES[1].text}\\", \\"sentiment\\": \\"neutral\\"}"
`);
  } else {
    console.log('SOME TESTS FAILED ✗');
    console.log('='.repeat(80));
  }

  return allPassed;
}

// Run tests
runTests()
  .then(success => {
    if (success) {
      console.log('\n✓ All pre-checks passed!');
    } else {
      console.log('\n✗ Some checks failed. Fix issues before testing webhook.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('\nTest error:', err);
    process.exit(1);
  });
