'use strict';

/**
 * Unit tests for services/translationWorkerPool.js
 *
 * All HTTP calls are mocked via global fetch mock.
 * Tests cover:
 *  - Initialization (health check success / failure)
 *  - Job submission and callbacks
 *  - Concurrency limiting
 *  - Queue backpressure
 *  - Retry with exponential backoff
 *  - Graceful degradation on failure
 *  - Metrics tracking
 *  - Shutdown
 */

// Set env vars before require
process.env.TRANSLATOR_URL = 'http://mock-translator:8000';
process.env.TRANSLATION_CONCURRENCY = '3';
process.env.MAX_TRANSLATION_QUEUE_SIZE = '10';
process.env.TRANSLATION_TIMEOUT_MS = '5000';
process.env.TRANSLATION_MAX_RETRIES = '2';

// We need to reset module state between tests since translationWorkerPool
// uses module-level state. Use jest.isolateModules for each describe block.

// Helper to load a fresh module instance
function loadFreshModule() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../services/translationWorkerPool');
  });
  return mod;
}

// ─── Mock fetch globally ──────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── Initialization Tests ─────────────────────────────────────────────────────

describe('TranslationWorkerPool - Initialization', () => {
  test('should initialize successfully when translator is healthy', async () => {
    const pool = loadFreshModule();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        status: 'healthy',
        tier1_count: 7,
        tier2_max_slots: 3,
        memory_mb: { rss: 500 },
      }),
    });

    await pool.initialize();
    const metrics = pool.getMetrics();
    expect(metrics.initialized).toBe(true);
    expect(metrics.translatorUrl).toBe('http://mock-translator:8000');
    expect(metrics.concurrencyLimit).toBe(3);

    await pool.shutdown();
  });

  test('should initialize (gracefully) even if translator is unreachable', async () => {
    const pool = loadFreshModule();

    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    // Fast-forward through the 30s init timeout
    const initPromise = pool.initialize();
    // Advance past all the 2s retry waits (30s / 2s = 15 retries)
    for (let i = 0; i < 16; i++) {
      await jest.advanceTimersByTimeAsync(2100);
    }
    await initPromise;

    const metrics = pool.getMetrics();
    expect(metrics.initialized).toBe(true); // graceful degradation

    await pool.shutdown();
  });

  test('should not initialize twice', async () => {
    const pool = loadFreshModule();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', tier1_count: 7, tier2_max_slots: 3 }),
    });

    await pool.initialize();
    const callCount = global.fetch.mock.calls.length;
    await pool.initialize(); // second call should be no-op
    expect(global.fetch.mock.calls.length).toBe(callCount);

    await pool.shutdown();
  });
});

// ─── Job Submission Tests ─────────────────────────────────────────────────────

describe('TranslationWorkerPool - Job submission', () => {
  let pool;

  beforeEach(async () => {
    pool = loadFreshModule();
    // Quick init without health check
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', tier1_count: 7, tier2_max_slots: 3 }),
    });
    await pool.initialize();
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  test('should submit job and receive translated result via callback', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        translated_text: 'Hello world',
        source_lang: 'es',
        tier: 1,
      }),
    });

    const item = {
      id: 'test-1',
      title: 'Titulo',
      content: 'Hola mundo este es un test',
      _detectedLangISO1: 'es',
      _detectedLangISO3: 'spa',
    };

    const result = await new Promise((resolve) => {
      pool.submitJob(item, (err, translatedItem, original) => {
        resolve({ err, translatedItem, original });
      });
      // Let async operations proceed
      jest.advanceTimersByTime(100);
    });

    // Allow microtasks to complete
    await jest.advanceTimersByTimeAsync(100);

    expect(result.err).toBeNull();
    expect(result.translatedItem.translatedContent).toBe('Hello world');
    expect(result.translatedItem.detectedLanguage).toBe('es');
    expect(result.translatedItem.translationTier).toBe(1);
    // Internal fields should be cleaned up
    expect(result.translatedItem._detectedLangISO1).toBeUndefined();
    expect(result.translatedItem._detectedLangISO3).toBeUndefined();
  });

  test('should reject jobs when not initialized', () => {
    const freshPool = loadFreshModule();
    // Don't initialize

    const callbackFn = jest.fn();
    const jobId = freshPool.submitJob({ id: 'test' }, callbackFn);

    expect(jobId).toBeNull();
    expect(callbackFn).toHaveBeenCalledWith(
      expect.any(Error),
      null,
      expect.objectContaining({ id: 'test' })
    );
  });

  test('should reject jobs when queue is full', async () => {
    // Queue max is 10, submit 11 jobs
    // Make fetch hang so jobs stay in flight
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));

    const callbacks = [];
    for (let i = 0; i < 10; i++) {
      pool.submitJob(
        { id: `item-${i}`, title: '', content: `content ${i}`, _detectedLangISO1: 'es' },
        () => {}
      );
    }

    const overflowCallback = jest.fn();
    const jobId = pool.submitJob(
      { id: 'overflow', title: '', content: 'overflow', _detectedLangISO1: 'es' },
      overflowCallback
    );

    expect(jobId).toBeNull();
    expect(overflowCallback).toHaveBeenCalledWith(
      expect.any(Error),
      null,
      expect.objectContaining({ id: 'overflow' })
    );
  });

  test('should return jobId on successful submission', () => {
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));

    const jobId = pool.submitJob(
      { id: 'test', title: '', content: 'content', _detectedLangISO1: 'es' },
      () => {}
    );

    expect(jobId).toBeTruthy();
    expect(typeof jobId).toBe('string');
  });

  test('should increment jobsSubmitted metric', () => {
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));

    const before = pool.getMetrics().jobsSubmitted;
    pool.submitJob({ id: '1', title: '', content: 'x', _detectedLangISO1: 'es' }, () => {});
    pool.submitJob({ id: '2', title: '', content: 'y', _detectedLangISO1: 'es' }, () => {});

    expect(pool.getMetrics().jobsSubmitted).toBe(before + 2);
  });
});

// ─── Retry and Graceful Degradation Tests ─────────────────────────────────────

describe('TranslationWorkerPool - Retries and degradation', () => {
  let pool;

  beforeEach(async () => {
    pool = loadFreshModule();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', tier1_count: 7, tier2_max_slots: 3 }),
    });
    await pool.initialize();
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  test('should retry on failure and eventually call back with null translatedContent', async () => {
    // All fetch calls fail
    let fetchCallCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCallCount++;
      return Promise.reject(new Error('ECONNREFUSED'));
    });

    const item = {
      id: 'retry-test',
      title: 'Test',
      content: 'Contenido de prueba para test',
      _detectedLangISO1: 'es',
      _detectedLangISO3: 'spa',
    };

    const resultPromise = new Promise((resolve) => {
      pool.submitJob(item, (err, translatedItem, original) => {
        resolve({ err, translatedItem, original });
      });
    });

    // Initial attempt fires immediately, then retries with backoff: 1s, 2s
    await jest.advanceTimersByTimeAsync(200);   // initial attempt
    await jest.advanceTimersByTimeAsync(1200);  // retry 1 (1s backoff)
    await jest.advanceTimersByTimeAsync(2200);  // retry 2 (2s backoff)
    await jest.advanceTimersByTimeAsync(100);   // settle

    const result = await resultPromise;

    // Graceful degradation: err is null, translatedContent is null
    expect(result.err).toBeNull();
    expect(result.translatedItem.translatedContent).toBeNull();
    expect(result.translatedItem.translationError).toBeDefined();
    expect(result.translatedItem.detectedLanguage).toBe('es');

    // Should have made 3 fetch calls (1 initial + 2 retries)
    expect(fetchCallCount).toBe(3);

    const metrics = pool.getMetrics();
    expect(metrics.jobsFailed).toBe(1);
    expect(metrics.translatorErrors).toBe(1);
  });

  test('should succeed on retry after initial failure', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.reject(new Error('temporary failure'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          translated_text: 'Success on retry',
          source_lang: 'es',
          tier: 1,
        }),
      });
    });

    const item = {
      id: 'retry-success',
      title: '',
      content: 'Contenido de prueba para test',
      _detectedLangISO1: 'es',
      _detectedLangISO3: 'spa',
    };

    const resultPromise = new Promise((resolve) => {
      pool.submitJob(item, (err, translatedItem) => {
        resolve({ err, translatedItem });
      });
    });

    await jest.advanceTimersByTimeAsync(200);   // initial failure
    await jest.advanceTimersByTimeAsync(1200);  // retry 1 succeeds
    await jest.advanceTimersByTimeAsync(100);   // settle

    const result = await resultPromise;
    expect(result.err).toBeNull();
    expect(result.translatedItem.translatedContent).toBe('Success on retry');
  });

  test('should handle HTTP error status with retry', async () => {
    let callCount = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.resolve({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          translated_text: 'Recovered',
          source_lang: 'de',
          tier: 1,
        }),
      });
    });

    const item = {
      id: 'http-retry',
      title: '',
      content: 'Hallo Welt test content hier',
      _detectedLangISO1: 'de',
      _detectedLangISO3: 'deu',
    };

    const resultPromise = new Promise((resolve) => {
      pool.submitJob(item, (err, translatedItem) => {
        resolve({ err, translatedItem });
      });
    });

    await jest.advanceTimersByTimeAsync(200);
    await jest.advanceTimersByTimeAsync(1200);
    await jest.advanceTimersByTimeAsync(2200);  // 3rd attempt
    await jest.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    // With MAX_RETRIES=2, we get 3 total attempts (1 initial + 2 retries)
    // If 3rd succeeds, we should have the translation
    expect(result.translatedItem.translatedContent).toBe('Recovered');
  });
});

// ─── Metrics Tests ────────────────────────────────────────────────────────────

describe('TranslationWorkerPool - Metrics', () => {
  let pool;

  beforeEach(async () => {
    pool = loadFreshModule();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', tier1_count: 7, tier2_max_slots: 3 }),
    });
    await pool.initialize();
  });

  afterEach(async () => {
    await pool.shutdown();
  });

  test('should track tier counts', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ translated_text: 'T1', source_lang: 'es', tier: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ translated_text: 'T2', source_lang: 'fr', tier: 2 }),
      });

    const makeItem = (id, lang) => ({
      id, title: '', content: `test content for ${id} language`,
      _detectedLangISO1: lang, _detectedLangISO3: 'xxx',
    });

    await new Promise((resolve) => {
      let completed = 0;
      const done = () => { if (++completed === 2) resolve(); };
      pool.submitJob(makeItem('t1', 'es'), done);
      pool.submitJob(makeItem('t2', 'fr'), done);
    });

    const metrics = pool.getMetrics();
    expect(metrics.tier1Count).toBe(1);
    expect(metrics.tier2Count).toBe(1);
    expect(metrics.jobsCompleted).toBe(2);
  });

  test('should compute average processing time', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ translated_text: 'OK', source_lang: 'es', tier: 1 }),
    });

    await new Promise((resolve) => {
      pool.submitJob(
        { id: '1', title: '', content: 'test content text here', _detectedLangISO1: 'es' },
        () => resolve()
      );
    });

    const metrics = pool.getMetrics();
    expect(metrics.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
  });

  test('getMetrics returns all expected fields', () => {
    const metrics = pool.getMetrics();
    expect(metrics).toEqual(expect.objectContaining({
      initialized: true,
      translatorUrl: expect.any(String),
      concurrencyLimit: expect.any(Number),
      activeRequests: expect.any(Number),
      queueDepth: expect.any(Number),
      jobsSubmitted: expect.any(Number),
      jobsCompleted: expect.any(Number),
      jobsFailed: expect.any(Number),
      translatorErrors: expect.any(Number),
      tier1Count: expect.any(Number),
      tier2Count: expect.any(Number),
      avgProcessingTimeMs: expect.any(Number),
    }));
  });
});

// ─── Shutdown Tests ───────────────────────────────────────────────────────────

describe('TranslationWorkerPool - Shutdown', () => {
  test('should mark as not initialized after shutdown', async () => {
    const pool = loadFreshModule();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy', tier1_count: 7, tier2_max_slots: 3 }),
    });
    await pool.initialize();
    expect(pool.getMetrics().initialized).toBe(true);

    await pool.shutdown();
    expect(pool.getMetrics().initialized).toBe(false);
  });
});
