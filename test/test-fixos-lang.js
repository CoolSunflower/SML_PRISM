/**
 * Test script for Fixos/French Portuguese language detection
 */
const { initializeBrandClassifier, classifyText, detectPortuguese } = require('../services/brandClassifier');

async function runTests() {
  console.log('Initializing Brand Classifier...\n');
  await initializeBrandClassifier();
  
  console.log('='.repeat(60));
  console.log('Testing Fixos/French Portuguese Language Detection');
  console.log('='.repeat(60));
  
  const testCases = [
    {
      name: 'French text with French query terms (English matches first)',
      text: 'fixos vis pied Les techniques de fusion fonctionnent tres bien pour le patient francais',
      expectedPortuguese: false,
      shouldMatch: true,
      // Note: English query matches first due to shared terms like 'fusion'
      expectedQueryName: 'English'
    },
    {
      name: 'Portuguese text with French query terms (FILTERED - key test)',
      text: 'fixos vis pied Os tecnicas estao a funcionar muito bem no paciente portugues com grande sucesso',
      expectedPortuguese: true,
      shouldMatch: false, // Should skip French match due to Portuguese detection, then no other match
      expectedQueryName: null
    },
    {
      name: 'Short text (franc may not detect accurately)',
      text: 'fixos pied vis tenho valores',
      expectedPortuguese: false, // Too short for accurate detection
      shouldMatch: false, // May not match any query
      expectedQueryName: null
    },
    {
      name: 'English Fixos text',
      text: 'fixos screws compression bone metatarsal great results',
      expectedPortuguese: false,
      shouldMatch: true,
      expectedQueryName: 'English'
    }
  ];
  
  for (const tc of testCases) {
    console.log(`\n--- Test: ${tc.name} ---`);
    console.log(`Text: "${tc.text}"`);
    
    const langResult = detectPortuguese(tc.text);
    console.log(`Language detection: ${langResult.lang} (isPortuguese: ${langResult.isPortuguese})`);
    
    const classResult = classifyText(tc.text);
    console.log(`Classification: matched=${classResult.matched}`);
    if (classResult.classification) {
      console.log(`  -> ${classResult.classification.subTopic}/${classResult.classification.queryName}`);
    }
    
    // Check expectations
    const ptMatch = langResult.isPortuguese === tc.expectedPortuguese;
    const classMatch = classResult.matched === tc.shouldMatch;
    const queryMatch = !tc.shouldMatch || !tc.expectedQueryName || 
                       (classResult.classification && classResult.classification.queryName === tc.expectedQueryName);
    
    if (ptMatch && classMatch && queryMatch) {
      console.log('✓ PASS');
    } else {
      console.log('✗ FAIL');
      if (!ptMatch) console.log(`  Expected isPortuguese: ${tc.expectedPortuguese}, got: ${langResult.isPortuguese}`);
      if (!classMatch) console.log(`  Expected match: ${tc.shouldMatch}, got: ${classResult.matched}`);
      if (!queryMatch) console.log(`  Expected query: ${tc.expectedQueryName}, got: ${classResult.classification?.queryName}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Tests complete');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
