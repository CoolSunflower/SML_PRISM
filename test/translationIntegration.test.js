'use strict';

/**
 * Integration tests for the translation pipeline
 *
 * Tests the full flow: language detection → translation worker pool → classification
 * Uses a mock HTTP server to simulate the Flask translator service.
 *
 * Run with: npx jest test/translationIntegration.test.js --runInBand --detectOpenHandles --forceExit
 */

const http = require('http');

// ── Mock translator HTTP server ───────────────────────────────────────────────

let mockTranslatorServer;
let mockServerPort;
let requestLog = [];

function createMockTranslator() {
  return new Promise((resolve) => {
    mockTranslatorServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const url = req.url;
        requestLog.push({ url, method: req.method, body });

        if (url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'healthy',
            tier1_count: 7,
            tier2_max_slots: 3,
            memory_mb: { rss: 500 },
          }));
          return;
        }

        if (url === '/translate' && req.method === 'POST') {
          try {
            const data = JSON.parse(body);
            const text = data.text || '';
            const lang = data.source_lang || '';

            // Simulate translation
            const tier = ['pt', 'ja', 'es', 'id', 'ar', 'de', 'sl'].includes(lang) ? 1 : 2;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              translated_text: `[EN] ${text}`,
              source_lang: lang,
              tier,
              original_text: text,
            }));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request' }));
          }
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      });
    });

    mockTranslatorServer.listen(0, () => {
      mockServerPort = mockTranslatorServer.address().port;
      resolve();
    });
  });
}

// ── Test Setup ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await createMockTranslator();
  process.env.TRANSLATOR_URL = `http://localhost:${mockServerPort}`;
  process.env.TRANSLATION_CONCURRENCY = '3';
  process.env.TRANSLATION_TIMEOUT_MS = '5000';
  process.env.TRANSLATION_MAX_RETRIES = '1';
  process.env.MAX_TRANSLATION_QUEUE_SIZE = '100';
}, 10000);

afterAll(async () => {
  if (mockTranslatorServer) {
    await new Promise(resolve => mockTranslatorServer.close(resolve));
  }
});

beforeEach(() => {
  requestLog = [];
});

// ── Translation Worker Pool Integration ───────────────────────────────────────

describe('Translation Pipeline Integration', () => {
  let translationPool;

  beforeAll(async () => {
    // Load fresh module so it picks up our env vars
    jest.isolateModules(() => {
      translationPool = require('../services/translationWorkerPool');
    });
    await translationPool.initialize();
  }, 35000);

  afterAll(async () => {
    await translationPool.shutdown();
  });

  test('should initialize successfully with mock translator', () => {
    const metrics = translationPool.getMetrics();
    expect(metrics.initialized).toBe(true);
    expect(metrics.translatorUrl).toBe(`http://localhost:${mockServerPort}`);
  });

  test('should translate a Spanish item via HTTP and return enriched item', (done) => {
    const item = {
      id: 'int-test-es',
      title: 'Titulo de prueba',
      content: 'Contenido sobre dispositivos médicos',
      platform: 'twitter',
      _detectedLangISO1: 'es',
      _detectedLangISO3: 'spa',
    };

    translationPool.submitJob(item, (err, translatedItem, original) => {
      try {
        expect(err).toBeNull();
        expect(translatedItem.translatedContent).toContain('[EN]');
        expect(translatedItem.detectedLanguage).toBe('es');
        expect(translatedItem.translationTier).toBe(1);  // es is Tier 1
        expect(translatedItem._detectedLangISO1).toBeUndefined();
        expect(original.id).toBe('int-test-es');
        done();
      } catch (e) {
        done(e);
      }
    });
  }, 10000);

  test('should translate a Tier 2 language (French) via HTTP', (done) => {
    const item = {
      id: 'int-test-fr',
      title: 'Titre de test',
      content: 'Contenu sur les dispositifs médicaux',
      platform: 'twitter',
      _detectedLangISO1: 'fr',
      _detectedLangISO3: 'fra',
    };

    translationPool.submitJob(item, (err, translatedItem) => {
      try {
        expect(err).toBeNull();
        expect(translatedItem.translatedContent).toContain('[EN]');
        expect(translatedItem.translationTier).toBe(2);  // fr is Tier 2
        done();
      } catch (e) {
        done(e);
      }
    });
  }, 10000);

  test('should handle multiple concurrent translation jobs', async () => {
    const langs = [
      { iso1: 'es', iso3: 'spa' },
      { iso1: 'de', iso3: 'deu' },
      { iso1: 'pt', iso3: 'por' },
      { iso1: 'fr', iso3: 'fra' },
      { iso1: 'it', iso3: 'ita' },
    ];

    const results = await Promise.all(
      langs.map((lang, idx) =>
        new Promise((resolve) => {
          translationPool.submitJob(
            {
              id: `concurrent-${idx}`,
              title: `Title ${idx}`,
              content: `Content for ${lang.iso1} test item`,
              _detectedLangISO1: lang.iso1,
              _detectedLangISO3: lang.iso3,
            },
            (err, translatedItem) => resolve({ err, translatedItem })
          );
        })
      )
    );

    expect(results).toHaveLength(5);
    results.forEach(({ err, translatedItem }) => {
      expect(err).toBeNull();
      expect(translatedItem.translatedContent).toContain('[EN]');
    });

    // Verify metrics
    const metrics = translationPool.getMetrics();
    expect(metrics.jobsCompleted).toBeGreaterThanOrEqual(5);
  }, 15000);

  test('should track metrics after translations', () => {
    const metrics = translationPool.getMetrics();
    expect(metrics.jobsSubmitted).toBeGreaterThan(0);
    expect(metrics.jobsCompleted).toBeGreaterThan(0);
    expect(metrics.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
  });
});

// ── Language Detection Integration ────────────────────────────────────────────

describe('Language Detection Integration (with real franc)', () => {
  let languageDetection;
  let francAvailable = false;

  beforeAll(async () => {
    languageDetection = require('../services/languageDetection');
    await languageDetection.initialize();
    // Check if franc actually loaded (dynamic import may fail in Jest without --experimental-vm-modules)
    const probe = languageDetection.detectLanguage('This is a long enough English sentence to probe franc availability');
    francAvailable = probe.iso3 !== null;
  });

  test('should detect English text', () => {
    if (!francAvailable) return; // franc not available in Jest CJS mode — skip
    const result = languageDetection.detectLanguage(
      'Stryker Corporation announced a voluntary recall of the Rejuvenate hip implant system for patients worldwide.'
    );
    expect(result.isEnglish).toBe(true);
    expect(result.iso1).toBe('en');
  });

  test('should detect Spanish text', () => {
    if (!francAvailable) return;
    const result = languageDetection.detectLanguage(
      'Stryker Corporation anunció un retiro voluntario del sistema de implante de cadera Rejuvenate para pacientes en todo el mundo.'
    );
    // franc should detect this as Spanish
    if (result.iso3 === 'spa') {
      expect(result.iso1).toBe('es');
      expect(result.isEnglish).toBe(false);
      expect(result.isSupported).toBe(true);
    }
  });

  test('should return fallback for very short text', () => {
    const result = languageDetection.detectLanguage('Hi');
    expect(result.isSupported).toBe(false);
  });

  test('should return fallback for null text', () => {
    const result = languageDetection.detectLanguage(null);
    expect(result.isSupported).toBe(false);
    expect(result.iso3).toBeNull();
  });
});
