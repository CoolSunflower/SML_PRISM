/**
 * Test script for KWatch webhook endpoint
 * Tests the PRODENSE brand query: (prodense) AND (stryker OR wright*)
 */

const BASE_URL = 'https://social-media-listening-ahawbrhza5ewc4au.eastus-01.azurewebsites.net';

async function testKWatchWebhook() {
  console.log('Testing KWatch Webhook Endpoint');
  console.log('='.repeat(50));
  console.log(`Target: ${BASE_URL}/api/webhook/kwatch`);
  console.log('');

  // Sample payload that matches PRODENSE query: (prodense) AND (stryker OR wright*)
  const testPayload = {
    platform: 'twitter',
    query: 'prodense stryker',
    datetime: new Date().toISOString(),
    link: 'https://twitter.com/test/status/123456789',
    author: 'test_user_prodense',
    title: 'Great results with PRODENSE',
    content: 'Just used PRODENSE bone gite substitute from Stryker in a shoulder joint procedure. Excellent biocompatibility and handling characteristics. Highly recommend for orthopedic surgeons.',
    sentiment: 'positive'
  };

  console.log('Sending test payload:');
  console.log(JSON.stringify(testPayload, null, 2));
  console.log('');

  try {
    const response = await fetch(`${BASE_URL}/api/webhook/kwatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const responseData = await response.json();
    
    console.log(`Response Status: ${response.status}`);
    console.log('Response Body:', JSON.stringify(responseData, null, 2));
    
    if (response.ok) {
      console.log('\n✓ Webhook test PASSED');
      console.log('\nThe item has been queued for processing.');
      console.log('It should be classified as: Shoulder Joint / PRODENSE');
    } else {
      console.log('\n✗ Webhook test FAILED');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run test
testKWatchWebhook();
