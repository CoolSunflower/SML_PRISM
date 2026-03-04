'use strict';

/**
 * Unit tests for classificationService.js
 *
 * Covers:
 * - extractSubTopicFromQuery helper
 * - hasNotWord helper (FR-CLS-07)
 * - performClassification NOT words filter (FR-CLS-07):
 *   items classified via RelevancyClassification are excluded when a NOT word matches
 * - Brand-matched items are NOT affected by the NOT words filter
 */

// Test command: npx jest test/classificationService.test.js

//  Mocks 

const mockClassifyText = jest.fn();
const mockClassifyRelevancy = jest.fn();
const mockIsRelevancyReady = jest.fn().mockReturnValue(true);

jest.mock('../services/brandClassifier', () => ({
  initializeBrandClassifier: jest.fn().mockResolvedValue({ success: true, queryCount: 10 }),
  classifyText: (...args) => mockClassifyText(...args),
}));

jest.mock('../utils/relevancyClassifier', () => ({
  initializeRelevancyClassifier: jest.fn().mockResolvedValue(undefined),
  classifyRelevancy: (...args) => mockClassifyRelevancy(...args),
  isReady: (...args) => mockIsRelevancyReady(...args),
}));

// Mock NOT words config with a small controlled set for tests
jest.mock('../config/alerts_not_words.json', () => ['football', 'nfl', 'comic book']);

//  Module under test 

const {
  extractSubTopicFromQuery,
  hasNotWord,
  performClassification,
} = require('../services/classificationService');

//  Test data helpers 

function makeItem(overrides = {}) {
  return {
    id: 'test-id',
    title: 'Test Title',
    content: 'Some medical device content about orthopedic surgery.',
    query: 'Stryker.Medical',
    ...overrides,
  };
}

const BRAND_MATCH = {
  matched: true,
  classification: {
    topic: 'Hip Joint',
    subTopic: 'Accolade',
    queryName: 'English',
    internalId: 'test-uuid',
  },
};

const NO_BRAND_MATCH = { matched: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsRelevancyReady.mockReturnValue(true);
  mockClassifyText.mockReturnValue(NO_BRAND_MATCH);
  mockClassifyRelevancy.mockResolvedValue({ isRelevant: true });
});

// =============================================================================
// extractSubTopicFromQuery
// =============================================================================

describe('extractSubTopicFromQuery', () => {
  test('extracts text before the first period', () => {
    expect(extractSubTopicFromQuery('Gamma3.Medical')).toBe('Gamma3');
  });

  test('returns the full query when no period is present', () => {
    expect(extractSubTopicFromQuery('Stryker')).toBe('Stryker');
  });

  test('returns Unknown for empty string', () => {
    expect(extractSubTopicFromQuery('')).toBe('Unknown');
  });

  test('returns Unknown for null', () => {
    expect(extractSubTopicFromQuery(null)).toBe('Unknown');
  });

  test('returns Unknown when text before period is blank', () => {
    expect(extractSubTopicFromQuery('.suffix')).toBe('Unknown');
  });

  test('trims whitespace around the extracted sub-topic', () => {
    expect(extractSubTopicFromQuery('  Stryker  .Medical')).toBe('Stryker');
  });
});

// =============================================================================
// hasNotWord (FR-CLS-07 helper)
// =============================================================================

describe('hasNotWord', () => {
  // NOT_WORDS mock: ['football', 'nfl', 'comic book']

  test('returns true when text contains a NOT word (exact)', () => {
    expect(hasNotWord('Stryker football player scores touchdown')).toBe(true);
  });

  test('returns true for case-insensitive match (uppercase)', () => {
    expect(hasNotWord('NFL quarterback uses Stryker knee brace')).toBe(true);
  });

  test('returns true for case-insensitive match (mixed case)', () => {
    expect(hasNotWord('Stryker Comic Book character')).toBe(true);
  });

  test('returns true when NOT word is a multi-word phrase', () => {
    expect(hasNotWord('This is a comic book collection')).toBe(true);
  });

  test('returns false when no NOT word is present', () => {
    expect(hasNotWord('Stryker orthopedic implant for hip surgery')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(hasNotWord('')).toBe(false);
  });

  test('returns false for null', () => {
    expect(hasNotWord(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(hasNotWord(undefined)).toBe(false);
  });
});

// =============================================================================
// performClassification — NOT words filter (FR-CLS-07)
// =============================================================================

describe('performClassification - NOT words filter (FR-CLS-07)', () => {
  test('excludes RelevancyClassification match when text contains a NOT word', async () => {
    mockClassifyText.mockReturnValue(NO_BRAND_MATCH);
    mockClassifyRelevancy.mockResolvedValue({ isRelevant: true });

    const item = makeItem({ content: 'Stryker football scholarship award ceremony' });
    const result = await performClassification(item);

    expect(result.matched).toBe(false);
  });

  test('allows RelevancyClassification match when text has no NOT word', async () => {
    mockClassifyText.mockReturnValue(NO_BRAND_MATCH);
    mockClassifyRelevancy.mockResolvedValue({ isRelevant: true });

    const item = makeItem({ content: 'Stryker orthopedic implant used in hip surgery' });
    const result = await performClassification(item);

    expect(result.matched).toBe(true);
    expect(result.method).toBe('RelevancyClassification');
  });

  test('NOT words filter does NOT apply to BrandQuery matches', async () => {
    // Even though the text mentions football, a brand match should still succeed
    mockClassifyText.mockReturnValue(BRAND_MATCH);
    mockClassifyRelevancy.mockResolvedValue({ isRelevant: true });

    const item = makeItem({ content: 'Stryker football player hip replacement surgery' });
    const result = await performClassification(item);

    expect(result.matched).toBe(true);
    expect(result.method).toBe('BrandQuery');
    expect(result.classification.topic).toBe('Hip Joint');
  });

  test('returns matched=false when relevancy model says not relevant (unrelated to NOT words)', async () => {
    mockClassifyText.mockReturnValue(NO_BRAND_MATCH);
    mockClassifyRelevancy.mockResolvedValue({ isRelevant: false });

    const item = makeItem({ content: 'Completely unrelated article about weather' });
    const result = await performClassification(item);

    expect(result.matched).toBe(false);
  });

  test('NOT word check is case-insensitive on the item title', async () => {
    mockClassifyText.mockReturnValue(NO_BRAND_MATCH);
    mockClassifyRelevancy.mockResolvedValue({ isRelevant: true });

    // Title contains a NOT word in uppercase; content does not
    const item = makeItem({ title: 'FOOTBALL PLAYER STRYKER', content: 'orthopedic surgery' });
    const result = await performClassification(item);

    expect(result.matched).toBe(false);
  });

  test('returns matched=false for empty text regardless of NOT words', async () => {
    const item = makeItem({ title: '', content: '' });
    const result = await performClassification(item);

    expect(result.matched).toBe(false);
    expect(mockClassifyText).not.toHaveBeenCalled();
  });
});
