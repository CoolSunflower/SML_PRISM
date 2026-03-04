'use strict';

const natural = require('natural');

const Analyzer = natural.SentimentAnalyzer;
const stemmer = natural.PorterStemmer;
const analyzer = new Analyzer('English', stemmer, 'afinn');

/**
 * Compute sentiment for a piece of text using the AFINN lexicon.
 *
 * The AFINN lexicon assigns integer scores (-5 to +5) to English words.
 * The analyzer computes the average score across all scored tokens.
 *
 * @param {string} text - The text to analyze
 * @returns {'Positive'|'Neutral'|'Negative'} Human-readable sentiment label
 */
function computeSentiment(text) {
  if (!text || typeof text !== 'string') return 'Neutral';

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'Neutral';

  const score = analyzer.getSentiment(tokens);

  if (score > 0) return 'Positive';
  if (score < 0) return 'Negative';
  return 'Neutral';
}

module.exports = { computeSentiment };


// run to test
// run using: node utils/sentimentAnalyzer.js
const tests = [
  'I love this product! It is amazing and works great.',
  'This is the worst experience I have ever had. Terrible service.',
  'The product is okay, not bad but not great either.',
  '',
  null,
  'Neutral statement with no sentiment words.',
];
tests.forEach((text, index) => {
  const sentiment = computeSentiment(text);
  console.log(`Test ${index + 1}: "${text}" => Sentiment: ${sentiment}`);
});
