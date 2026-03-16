'use strict';

/**
 * Unit tests for kwatchQueue.js translation flow
 *
 * Tests the language detection → translation → classification pipeline:
 *  - English items bypass translation, go directly to classification
 *  - Non-English supported language items go through translation pool first
 *  - Unsupported language items bypass translation, go directly to classification
 *  - Translation fields are included in processed documents
 *  - Translation callback wires correctly into classification
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock database
const mockCreate = jest.fn().mockResolvedValue({});
jest.mock('../config/database', () => ({
  kwatchContainer: {
    items: { create: (...args) => mockCreate(...args) },
  },
  kwatchProcessedContainer: {
    items: { create: jest.fn().mockResolvedValue({}) },
  },
}));

// Mock classification worker pool
const mockClassifySubmit = jest.fn();
jest.mock('../services/classificationWorkerPool', () => ({
  submitJob: (...args) => mockClassifySubmit(...args),
}));

// Mock translation worker pool
const mockTranslateSubmit = jest.fn();
jest.mock('../services/translationWorkerPool', () => ({
  submitJob: (...args) => mockTranslateSubmit(...args),
}));

// Mock language detection
const mockDetectLanguage = jest.fn();
jest.mock('../services/languageDetection', () => ({
  detectLanguage: (...args) => mockDetectLanguage(...args),
}));

// Mock analytics
jest.mock('../services/analyticsService', () => ({
  recordRawItem: jest.fn(),
  recordProcessedItem: jest.fn(),
}));

// ── Module under test ─────────────────────────────────────────────────────────

const {
  addToQueue,
  processKWatchQueue,
  getQueueStatus,
  generateKWatchId,
} = require('../services/kwatchQueue');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(overrides = {}) {
  return {
    id: overrides.id || 'test-item-001',
    platform: 'twitter',
    query: 'Stryker.Medical',
    datetime: '2025-01-01T00:00:00Z',
    link: 'https://example.com/post',
    author: 'testuser',
    title: 'Test Title',
    content: 'Test content about medical devices',
    sentiment: 'Neutral',
    receivedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({});
  mockClassifySubmit.mockReturnValue('mock-classify-job-id');
  mockTranslateSubmit.mockReturnValue('mock-translate-job-id');
});

// ─── generateKWatchId ─────────────────────────────────────────────────────────

describe('generateKWatchId', () => {
  test('should generate deterministic hash from content', () => {
    const id1 = generateKWatchId('test content');
    const id2 = generateKWatchId('test content');
    expect(id1).toBe(id2);
  });

  test('should generate different hashes for different content', () => {
    const id1 = generateKWatchId('content A');
    const id2 = generateKWatchId('content B');
    expect(id1).not.toBe(id2);
  });
});

// ─── Queue Status ─────────────────────────────────────────────────────────────

describe('getQueueStatus', () => {
  test('returns pending count and processing state', () => {
    const status = getQueueStatus();
    expect(status).toHaveProperty('pending');
    expect(status).toHaveProperty('processing');
  });
});

// ─── English item flow ────────────────────────────────────────────────────────

describe('KWatch Queue - English items', () => {
  test('should send English items directly to classification, not translation', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'eng', iso1: 'en', isEnglish: true, isSupported: true,
    });

    const item = makeItem({ content: 'Stryker medical device recall notice' });
    addToQueue(item);
    await processKWatchQueue();

    // Classification pool should be called
    expect(mockClassifySubmit).toHaveBeenCalledTimes(1);
    const submittedItem = mockClassifySubmit.mock.calls[0][0];
    expect(submittedItem.detectedLanguage).toBe('en');

    // Translation pool should NOT be called
    expect(mockTranslateSubmit).not.toHaveBeenCalled();
  });
});

// ─── Supported non-English item flow ──────────────────────────────────────────

describe('KWatch Queue - Supported non-English items', () => {
  test('should send Spanish items to translation pool', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'spa', iso1: 'es', isEnglish: false, isSupported: true,
    });

    const item = makeItem({
      content: 'Stryker dispositivo médico retirado del mercado',
    });
    addToQueue(item);
    await processKWatchQueue();

    // Translation pool should be called
    expect(mockTranslateSubmit).toHaveBeenCalledTimes(1);
    const submittedItem = mockTranslateSubmit.mock.calls[0][0];
    expect(submittedItem._detectedLangISO1).toBe('es');
    expect(submittedItem._detectedLangISO3).toBe('spa');

    // Classification pool should NOT be called (translation callback will call it)
    expect(mockClassifySubmit).not.toHaveBeenCalled();
  });

  test('should send Portuguese items to translation pool', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'por', iso1: 'pt', isEnglish: false, isSupported: true,
    });

    const item = makeItem({
      content: 'Dispositivo médico Stryker recolhido do mercado',
    });
    addToQueue(item);
    await processKWatchQueue();

    expect(mockTranslateSubmit).toHaveBeenCalledTimes(1);
    expect(mockTranslateSubmit.mock.calls[0][0]._detectedLangISO1).toBe('pt');
  });

  test('should send Japanese items to translation pool', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'jpn', iso1: 'ja', isEnglish: false, isSupported: true,
    });

    addToQueue(makeItem({ content: 'ストライカー医療機器のリコール通知が発表されました' }));
    await processKWatchQueue();

    expect(mockTranslateSubmit).toHaveBeenCalledTimes(1);
    expect(mockTranslateSubmit.mock.calls[0][0]._detectedLangISO1).toBe('ja');
  });
});

// ─── Unsupported language item flow ───────────────────────────────────────────

describe('KWatch Queue - Unsupported language items', () => {
  test('should send unsupported language items directly to classification', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'hin', iso1: null, isEnglish: false, isSupported: false,
    });

    addToQueue(makeItem({ content: 'स्ट्राइकर मेडिकल डिवाइस रिकॉल' }));
    await processKWatchQueue();

    // Should go directly to classification
    expect(mockClassifySubmit).toHaveBeenCalledTimes(1);
    expect(mockClassifySubmit.mock.calls[0][0].detectedLanguage).toBeNull();

    // Should NOT go to translation
    expect(mockTranslateSubmit).not.toHaveBeenCalled();
  });

  test('should send undetermined language items directly to classification', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'und', iso1: null, isEnglish: false, isSupported: false,
    });

    addToQueue(makeItem({ content: '12345 @#$%^ XYZZY' }));
    await processKWatchQueue();

    expect(mockClassifySubmit).toHaveBeenCalledTimes(1);
    expect(mockTranslateSubmit).not.toHaveBeenCalled();
  });
});

// ─── Mixed batch processing ──────────────────────────────────────────────────

describe('KWatch Queue - Mixed batch', () => {
  test('should correctly route a batch of mixed-language items', async () => {
    // Set up language detection to return different results per call
    let callIdx = 0;
    const langResponses = [
      { iso3: 'eng', iso1: 'en', isEnglish: true, isSupported: true },     // English
      { iso3: 'spa', iso1: 'es', isEnglish: false, isSupported: true },     // Spanish → translate
      { iso3: 'hin', iso1: null, isEnglish: false, isSupported: false },    // Hindi → unsupported
    ];
    mockDetectLanguage.mockImplementation(() => langResponses[callIdx++]);

    addToQueue(makeItem({ id: 'en-item', content: 'English medical content' }));
    addToQueue(makeItem({ id: 'es-item', content: 'Contenido médico en español' }));
    addToQueue(makeItem({ id: 'hi-item', content: 'हिंदी चिकित्सा सामग्री' }));
    await processKWatchQueue();

    // English + Hindi → classification directly (2 calls)
    expect(mockClassifySubmit).toHaveBeenCalledTimes(2);
    // Spanish → translation pool (1 call)
    expect(mockTranslateSubmit).toHaveBeenCalledTimes(1);

    // Verify the Spanish item went to translation
    expect(mockTranslateSubmit.mock.calls[0][0]._detectedLangISO1).toBe('es');

    // Verify English item has detectedLanguage set
    const enCall = mockClassifySubmit.mock.calls.find(c => c[0].id === 'en-item');
    expect(enCall[0].detectedLanguage).toBe('en');
  });
});

// ─── Translation callback integration ─────────────────────────────────────────

describe('KWatch Queue - Translation callback', () => {
  test('translation callback should submit to classification pool', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'spa', iso1: 'es', isEnglish: false, isSupported: true,
    });

    // Capture the callback passed to translation pool
    let capturedCallback = null;
    mockTranslateSubmit.mockImplementation((item, cb) => {
      capturedCallback = cb;
      return 'mock-job-id';
    });

    addToQueue(makeItem({ content: 'Dispositivo médico Stryker recall notice' }));
    await processKWatchQueue();

    expect(capturedCallback).not.toBeNull();

    // Simulate translation pool calling back with translated item
    const translatedItem = {
      ...makeItem(),
      translatedContent: 'Stryker medical device recall notice',
      detectedLanguage: 'es',
      translationTier: 1,
    };
    capturedCallback(null, translatedItem, makeItem());

    // Now classification pool should have been called
    expect(mockClassifySubmit).toHaveBeenCalledTimes(1);
    const classifiedItem = mockClassifySubmit.mock.calls[0][0];
    expect(classifiedItem.translatedContent).toBe('Stryker medical device recall notice');
    expect(classifiedItem.detectedLanguage).toBe('es');
  });

  test('translation error callback should still submit original item to classification', async () => {
    mockDetectLanguage.mockReturnValue({
      iso3: 'spa', iso1: 'es', isEnglish: false, isSupported: true,
    });

    let capturedCallback = null;
    mockTranslateSubmit.mockImplementation((item, cb) => {
      capturedCallback = cb;
      return 'mock-job-id';
    });

    const originalItem = makeItem({ content: 'Contenido en español aquí' });
    addToQueue(originalItem);
    await processKWatchQueue();

    // Simulate translation error
    capturedCallback(new Error('Translation failed'), null, originalItem);

    // Classification should still be called with original item
    expect(mockClassifySubmit).toHaveBeenCalledTimes(1);
  });
});
