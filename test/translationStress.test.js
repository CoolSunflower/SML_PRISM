'use strict';

/**
 * Stress tests for the translation pipeline
 *
 * Tests:
 *  - High-volume concurrent translations
 *  - Queue backpressure under load
 *  - Metrics consistency after heavy load
 *  - Mixed success/failure responses under load
 *  - Simulated slow translator responses
 *
 * Run with: npx jest test/translationStress.test.js --runInBand --detectOpenHandles --forceExit
 */

const http = require('http');

// ── Mock Translator Server ────────────────────────────────────────────────────

let mockServer;
let serverPort;
let requestCount = 0;
let simulateDelay = 0;      // ms to delay responses
let simulateFailRate = 0;    // 0-1, fraction of requests that fail

function createMockTranslator() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'healthy', tier1_count: 7, tier2_max_slots: 3,
            memory_mb: { rss: 400 },
          }));
          return;
        }

        if (req.url === '/translate') {
          requestCount++;

          // Simulate failures
          if (simulateFailRate > 0 && Math.random() < simulateFailRate) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service Unavailable (simulated)' }));
            return;
          }

          const respond = () => {
            try {
              const data = JSON.parse(body);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                translated_text: `[EN] ${data.text.substring(0, 50)}`,
                source_lang: data.source_lang,
                tier: 1,
              }));
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Bad request' }));
            }
          };

          if (simulateDelay > 0) {
            setTimeout(respond, simulateDelay);
          } else {
            respond();
          }
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });
    });

    mockServer.listen(0, () => {
      serverPort = mockServer.address().port;
      resolve();
    });
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await createMockTranslator();
  process.env.TRANSLATOR_URL = `http://localhost:${serverPort}`;
  process.env.TRANSLATION_CONCURRENCY = '10';
  process.env.MAX_TRANSLATION_QUEUE_SIZE = '500';
  process.env.TRANSLATION_TIMEOUT_MS = '10000';
  process.env.TRANSLATION_MAX_RETRIES = '1';
}, 10000);

afterAll(async () => {
  if (mockServer) {
    await new Promise(resolve => mockServer.close(resolve));
  }
});

beforeEach(() => {
  requestCount = 0;
  simulateDelay = 0;
  simulateFailRate = 0;
});

// ── Helper ────────────────────────────────────────────────────────────────────

function makeItem(idx, lang = 'es') {
  return {
    id: `stress-${idx}`,
    title: `Stress Test Title ${idx}`,
    content: `This is stress test content number ${idx} for language ${lang} in medical devices`,
    _detectedLangISO1: lang,
    _detectedLangISO3: 'spa',
  };
}

// ── Stress Tests ──────────────────────────────────────────────────────────────

describe('Translation Pipeline - Stress Tests', () => {
  let pool;

  beforeEach(async () => {
    jest.isolateModules(() => {
      pool = require('../services/translationWorkerPool');
    });
    await pool.initialize();
  }, 35000);

  afterEach(async () => {
    if (pool) await pool.shutdown();
  });

  test('should handle 50 concurrent translations', async () => {
    const COUNT = 50;

    const results = await Promise.all(
      Array.from({ length: COUNT }, (_, i) =>
        new Promise((resolve) => {
          pool.submitJob(makeItem(i), (err, translatedItem) => {
            resolve({ err, translatedItem });
          });
        })
      )
    );

    expect(results).toHaveLength(COUNT);

    const successes = results.filter(r => r.err === null && r.translatedItem?.translatedContent);
    expect(successes.length).toBe(COUNT);

    const metrics = pool.getMetrics();
    expect(metrics.jobsCompleted).toBe(COUNT);
    expect(metrics.jobsFailed).toBe(0);
  }, 30000);

  test('should handle 100 translations with rate-limited concurrency', async () => {
    const COUNT = 100;

    const results = await Promise.all(
      Array.from({ length: COUNT }, (_, i) =>
        new Promise((resolve) => {
          pool.submitJob(makeItem(i), (err, translatedItem) => {
            resolve({ err, translatedItem });
          });
        })
      )
    );

    expect(results).toHaveLength(COUNT);

    const metrics = pool.getMetrics();
    // All should succeed since mock translator always responds 200
    expect(metrics.jobsCompleted).toBe(COUNT);
    expect(metrics.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
  }, 60000);

  test('should maintain metrics consistency under mixed success/failure load', async () => {
    simulateFailRate = 0.3; // 30% failure rate
    const COUNT = 40;

    const results = await Promise.all(
      Array.from({ length: COUNT }, (_, i) =>
        new Promise((resolve) => {
          pool.submitJob(makeItem(i), (err, translatedItem) => {
            resolve({ err, translatedItem });
          });
        })
      )
    );

    expect(results).toHaveLength(COUNT);

    const metrics = pool.getMetrics();
    // jobsCompleted + jobsFailed should equal COUNT
    // (some may succeed on retry)
    expect(metrics.jobsCompleted + metrics.jobsFailed).toBe(COUNT);
    expect(metrics.jobsSubmitted).toBe(COUNT);
  }, 60000);

  test('should handle slow translator responses without timing out', async () => {
    simulateDelay = 200; // 200ms per response
    const COUNT = 20;

    const start = Date.now();
    const results = await Promise.all(
      Array.from({ length: COUNT }, (_, i) =>
        new Promise((resolve) => {
          pool.submitJob(makeItem(i), (err, translatedItem) => {
            resolve({ err, translatedItem });
          });
        })
      )
    );
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(COUNT);

    const successes = results.filter(r => r.translatedItem?.translatedContent);
    expect(successes.length).toBe(COUNT);

    // With 10 concurrency and 200ms each, 20 items should take ~400-600ms
    // (2 waves of 10), not 20 * 200ms = 4000ms
    expect(elapsed).toBeLessThan(10000);

    const metrics = pool.getMetrics();
    expect(metrics.avgProcessingTimeMs).toBeGreaterThanOrEqual(200);
  }, 30000);

  test('queue backpressure: should reject jobs beyond max queue size', async () => {
    // Make requests hang so the queue fills up
    simulateDelay = 60000; // Very long delay

    const MAX_QUEUE = 500; // from env
    const SUBMIT_COUNT = 510;

    let accepted = 0;
    let rejected = 0;

    for (let i = 0; i < SUBMIT_COUNT; i++) {
      const jobId = pool.submitJob(makeItem(i), () => {});
      if (jobId) accepted++;
      else rejected++;
    }

    expect(accepted).toBeLessThanOrEqual(MAX_QUEUE);
    expect(rejected).toBeGreaterThan(0);
    expect(accepted + rejected).toBe(SUBMIT_COUNT);
  }, 10000);

  test('should handle rapid sequential submissions without errors', async () => {
    const COUNT = 200;
    let completedCount = 0;

    await new Promise((resolve) => {
      for (let i = 0; i < COUNT; i++) {
        pool.submitJob(makeItem(i), () => {
          completedCount++;
          if (completedCount === COUNT) resolve();
        });
      }
    });

    expect(completedCount).toBe(COUNT);

    const metrics = pool.getMetrics();
    expect(metrics.jobsCompleted).toBe(COUNT);
  }, 60000);

  test('metrics counters should be consistent after stress test', async () => {
    const COUNT = 30;

    await Promise.all(
      Array.from({ length: COUNT }, (_, i) =>
        new Promise(resolve => {
          pool.submitJob(makeItem(i), () => resolve());
        })
      )
    );

    const metrics = pool.getMetrics();
    expect(metrics.jobsSubmitted).toBe(COUNT);
    expect(metrics.jobsCompleted + metrics.jobsFailed).toBe(COUNT);
    expect(metrics.activeRequests).toBe(0);
    expect(metrics.queueDepth).toBe(0);
  }, 30000);
});
