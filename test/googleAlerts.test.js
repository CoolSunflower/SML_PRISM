/**
 * Comprehensive Unit Tests for Google Alerts Service
 *
 * Tests cover:
 * - URL extraction from Google Alerts redirect links
 * - NOT websites blocklist matching
 * - Feed scraping (Phase 1): RSS parsing, state comparison, new entry detection
 * - Queue processing (Phase 2): dedup, NOT websites, content fetching, raw insert, classification
 * - Classification result handler
 * - Empty/error feed handling
 * - Overlap prevention (concurrent scrape guard)
 * - Scraper lifecycle (start/stop/status)
 * - API routes (via supertest)
 */

// Mock setup
// Database container mocks
const mockRawCreate = jest.fn();
const mockRawQueryFetchAll = jest.fn();
const mockRawItemRead = jest.fn();
const mockRawItemDelete = jest.fn();
const mockProcessedCreate = jest.fn();
const mockProcessedQueryFetchAll = jest.fn();
const mockStateQueryFetchAll = jest.fn();
const mockStateUpsert = jest.fn();

jest.mock('../config/database', () => ({
  googleAlertsRawContainer: {
    items: {
      create: (...args) => mockRawCreate(...args),
      query: (...args) => ({ fetchAll: () => mockRawQueryFetchAll(...args) }),
    },
    item: (...args) => ({
      read: () => mockRawItemRead(...args),
      delete: () => mockRawItemDelete(...args),
    }),
  },
  googleAlertsProcessedContainer: {
    items: {
      create: (...args) => mockProcessedCreate(...args),
      query: (...args) => ({ fetchAll: () => mockProcessedQueryFetchAll(...args) }),
    },
  },
  googleAlertsStateContainer: {
    items: {
      query: (...args) => ({ fetchAll: () => mockStateQueryFetchAll(...args) }),
      upsert: (...args) => mockStateUpsert(...args),
    },
  },
}));

// Worker pool mock
const mockSubmitJob = jest.fn();
jest.mock('../services/classificationWorkerPool', () => ({
  submitJob: (...args) => mockSubmitJob(...args),
  getMetrics: jest.fn(() => ({ initialized: true, workerCount: 2 })),
}));

// RSS Parser mock
const mockParseURL = jest.fn();
jest.mock('rss-parser', () => jest.fn(() => ({ parseURL: mockParseURL })));

// RSS feeds config mock (2 feeds for testing)
jest.mock('../config/alerts_rss_feeds.json', () => ({
  'Stryker': 'https://www.google.com/alerts/feeds/05363435168125045984/feed1',
  'Test Product': 'https://www.google.com/alerts/feeds/05363435168125045984/feed2',
}));

// NOT websites config mock
jest.mock('../config/alerts_not_websites.json', () => ['blocked.com', 'spam.org']);

// JSDOM mock
const mockJSDOMInstance = { window: { document: {} } };
jest.mock('jsdom', () => ({
  JSDOM: jest.fn(() => mockJSDOMInstance),
}));

// Readability mock
const mockReadabilityParse = jest.fn();
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn(() => ({ parse: mockReadabilityParse })),
}));

// ─── Require module under test ───────────────────────────────────────────────

const {
  extractUrlFromGoogleLink,
  isNotWebsite,
  scrapeAllFeeds,
  startGoogleAlertsScraper,
  stopGoogleAlertsScraper,
  getScraperStatus,
} = require('../services/googleAlertsService');

const crypto = require('crypto');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a Google Alerts redirect URL wrapping a real destination */
function googleLink(realUrl) {
  return `https://www.google.com/url?rct=j&sa=t&url=${encodeURIComponent(realUrl)}&ct=ga&cd=abc&usg=xyz`;
}

/** Build a mock RSS feed entry */
function makeEntry(link, title, content, isoDate) {
  return {
    link,
    title: title || 'Test Title',
    content: content || 'Test content snippet for the entry',
    isoDate: isoDate || '2026-02-21T00:00:00Z',
  };
}

/** Compute the hash that the service uses for link comparison */
function linkHash(link) {
  return crypto.createHash('md5').update(link).digest('hex');
}

/** Compute the state document ID for a feed name */
function stateId(feedName) {
  return crypto.createHash('md5').update(feedName).digest('hex');
}

/** Compute document ID from a URL */
function docIdFromUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

// ─── Reset mocks before each test ────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();

  // Default: state container returns empty (no prior state)
  mockStateQueryFetchAll.mockResolvedValue({ resources: [] });
  mockStateUpsert.mockResolvedValue({});

  // Default: raw container dedup check returns 404 (not found)
  mockRawItemRead.mockRejectedValue({ code: 404 });
  mockRawCreate.mockResolvedValue({});

  // Default: processed container create succeeds
  mockProcessedCreate.mockResolvedValue({});

  // Default: worker pool accepts job
  mockSubmitJob.mockReturnValue('mock-job-id');

  // Default: RSS parser returns empty feed
  mockParseURL.mockResolvedValue({ items: [] });

  // Default: fetch returns non-HTML (content extraction skipped)
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: () => Promise.resolve('<html><body><p>Article body text that is definitely long enough to pass the one hundred character minimum threshold for readability extraction.</p></body></html>'),
  });

  // Default: Readability returns article text
  mockReadabilityParse.mockReturnValue({
    textContent: 'Extracted article content that is definitely long enough to pass the one hundred character minimum threshold for the readability extraction check in the service.',
  });
});

// =============================================================================
// Pure function tests
// =============================================================================

describe('extractUrlFromGoogleLink', () => {
  test('extracts URL from standard Google Alerts redirect', () => {
    const input = 'https://www.google.com/url?rct=j&sa=t&url=https://www.espn.com/video/clip%3Fid%3D47990161&ct=ga&cd=CAIyHmY5YzZkY2ZhZjA5ZGE2NWY6Y28uaW46ZW46SU46TA&usg=AOvVaw0WmhJo--f518y_gwADs2uQ';
    expect(extractUrlFromGoogleLink(input)).toBe('https://www.espn.com/video/clip?id=47990161');
  });

  test('extracts URL with complex query parameters', () => {
    const realUrl = 'https://example.com/article?a=1&b=2&c=3';
    expect(extractUrlFromGoogleLink(googleLink(realUrl))).toBe(realUrl);
  });

  test('extracts URL with encoded special characters', () => {
    const realUrl = 'https://example.com/path/to/article?q=hello+world&lang=en';
    expect(extractUrlFromGoogleLink(googleLink(realUrl))).toBe(realUrl);
  });

  test('returns null when url parameter is missing', () => {
    expect(extractUrlFromGoogleLink('https://www.google.com/url?rct=j&sa=t&ct=ga')).toBeNull();
  });

  test('returns null for completely invalid input', () => {
    expect(extractUrlFromGoogleLink('not a url at all')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractUrlFromGoogleLink('')).toBeNull();
  });

  test('returns null when url parameter is not a valid URL', () => {
    expect(extractUrlFromGoogleLink('https://www.google.com/url?url=not-a-valid-url')).toBeNull();
  });

  test('handles URL with fragment', () => {
    const realUrl = 'https://example.com/article#section-2';
    expect(extractUrlFromGoogleLink(googleLink(realUrl))).toBe(realUrl);
  });

  test('handles URL with port number', () => {
    const realUrl = 'https://example.com:8080/api/article';
    expect(extractUrlFromGoogleLink(googleLink(realUrl))).toBe(realUrl);
  });
});

describe('isNotWebsite', () => {
  // NOT_WEBSITES is mocked as ['blocked.com', 'spam.org']

  test('blocks exact domain match', () => {
    expect(isNotWebsite('https://blocked.com/article')).toBe(true);
  });

  test('blocks subdomain match (www prefix)', () => {
    expect(isNotWebsite('https://www.blocked.com/article')).toBe(true);
  });

  test('blocks deep subdomain match', () => {
    expect(isNotWebsite('https://news.sub.blocked.com/article')).toBe(true);
  });

  test('blocks second entry in blocklist', () => {
    expect(isNotWebsite('https://www.spam.org/page')).toBe(true);
  });

  test('allows non-blocked domain', () => {
    expect(isNotWebsite('https://www.espn.com/article')).toBe(false);
  });

  test('does not match partial domain names', () => {
    // "notblocked.com" should NOT match "blocked.com"
    expect(isNotWebsite('https://notblocked.com/article')).toBe(false);
  });

  test('is case-insensitive', () => {
    expect(isNotWebsite('https://WWW.BLOCKED.COM/ARTICLE')).toBe(true);
  });

  test('returns false for invalid URL', () => {
    expect(isNotWebsite('not-a-url')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isNotWebsite('')).toBe(false);
  });
});

// =============================================================================
// Feed scraping tests (Phase 1)
// =============================================================================

describe('scrapeAllFeeds - Phase 1 (feed scraping)', () => {
  test('scrapes feeds and collects new entries into queue', async () => {
    const link1 = googleLink('https://example.com/article-1');
    const link2 = googleLink('https://example.com/article-2');

    // Feed "Stryker" has 2 entries, "Test Product" is empty
    mockParseURL
      .mockResolvedValueOnce({
        items: [
          makeEntry(link1, '<b>Stryker</b> News', 'Content about Stryker devices'),
          makeEntry(link2, 'Older Article', 'Older content'),
        ],
      })
      .mockResolvedValueOnce({ items: [] }); // Test Product: empty

    await scrapeAllFeeds();

    // State should be saved for both feeds
    expect(mockStateUpsert).toHaveBeenCalledTimes(2);

    // Stryker feed: state saved with topmost link hash
    const strykerStateCall = mockStateUpsert.mock.calls.find(
      c => c[0].feedName === 'Stryker'
    );
    expect(strykerStateCall).toBeDefined();
    expect(strykerStateCall[0].lastLinkHash).toBe(linkHash(link1));
    expect(strykerStateCall[0].entryCount).toBe(2);

    // Test Product feed: state saved with null hash (empty)
    const testProductStateCall = mockStateUpsert.mock.calls.find(
      c => c[0].feedName === 'Test Product'
    );
    expect(testProductStateCall).toBeDefined();
    expect(testProductStateCall[0].lastLinkHash).toBeNull();
    expect(testProductStateCall[0].entryCount).toBe(0);

    // 2 items should have been processed (inserted into raw)
    expect(mockRawCreate).toHaveBeenCalledTimes(2);
  });

  test('skips feed when topmost hash matches stored state (no new content)', async () => {
    const link1 = googleLink('https://example.com/same-article');

    // Set up prior state: already seen this topmost link
    mockStateQueryFetchAll.mockResolvedValue({
      resources: [
        {
          id: stateId('Stryker'),
          feedName: 'Stryker',
          lastLinkHash: linkHash(link1),
          entryCount: 1,
        },
      ],
    });

    mockParseURL
      .mockResolvedValueOnce({ items: [makeEntry(link1, 'Same Article')] })
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    // State upserted only for empty feed (Test Product) and NOT for Stryker (unchanged)
    const strykerStateCalls = mockStateUpsert.mock.calls.filter(
      c => c[0].feedName === 'Stryker'
    );
    expect(strykerStateCalls).toHaveLength(0);

    // No items processed
    expect(mockRawCreate).not.toHaveBeenCalled();
  });

  test('only collects entries newer than the last known hash', async () => {
    const linkNew = googleLink('https://example.com/new-article');
    const linkKnown = googleLink('https://example.com/known-article');
    const linkOld = googleLink('https://example.com/old-article');

    // State: we last saw linkKnown
    mockStateQueryFetchAll.mockResolvedValue({
      resources: [
        {
          id: stateId('Stryker'),
          feedName: 'Stryker',
          lastLinkHash: linkHash(linkKnown),
          entryCount: 2,
        },
      ],
    });

    // Feed now has a new entry on top, plus the known one and an old one
    mockParseURL
      .mockResolvedValueOnce({
        items: [
          makeEntry(linkNew, 'New Article'),
          makeEntry(linkKnown, 'Known Article'),
          makeEntry(linkOld, 'Old Article'),
        ],
      })
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    // Only 1 new item should be processed (linkNew), not linkKnown or linkOld
    expect(mockRawCreate).toHaveBeenCalledTimes(1);
    const insertedDoc = mockRawCreate.mock.calls[0][0];
    expect(insertedDoc.extractedUrl).toBe('https://example.com/new-article');
  });

  test('handles RSS fetch failure gracefully (state NOT updated)', async () => {
    mockParseURL
      .mockRejectedValueOnce(new Error('Network timeout')) // Stryker: fails
      .mockResolvedValueOnce({ items: [] }); // Test Product: ok

    await scrapeAllFeeds();

    // State should only be saved for Test Product (the successful one)
    const savedFeedNames = mockStateUpsert.mock.calls.map(c => c[0].feedName);
    expect(savedFeedNames).not.toContain('Stryker');
    expect(savedFeedNames).toContain('Test Product');
  });

  test('empty feed saves state with null hash', async () => {
    mockParseURL
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    expect(mockStateUpsert).toHaveBeenCalledTimes(2);
    for (const call of mockStateUpsert.mock.calls) {
      expect(call[0].lastLinkHash).toBeNull();
      expect(call[0].entryCount).toBe(0);
    }
  });

  test('first-time scrape with no prior state processes all entries', async () => {
    const link1 = googleLink('https://example.com/first');
    const link2 = googleLink('https://example.com/second');
    const link3 = googleLink('https://example.com/third');

    mockParseURL
      .mockResolvedValueOnce({
        items: [
          makeEntry(link1, 'First'),
          makeEntry(link2, 'Second'),
          makeEntry(link3, 'Third'),
        ],
      })
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    // All 3 entries should be processed
    expect(mockRawCreate).toHaveBeenCalledTimes(3);
  });

  test('strips HTML tags from entry titles and content', async () => {
    const link = googleLink('https://example.com/html-test');

    mockParseURL
      .mockResolvedValueOnce({
        items: [{
          link,
          title: '<b>Bold</b> Title &amp; More',
          content: '<p>Paragraph</p> with &nbsp; entities',
          isoDate: '2026-02-21T00:00:00Z',
        }],
      })
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    const doc = mockRawCreate.mock.calls[0][0];
    expect(doc.title).not.toContain('<b>');
    expect(doc.title).not.toContain('</b>');
    // Content snippet should have HTML stripped
    expect(doc.contentSnippet).not.toContain('<p>');
  });
});

// =============================================================================
// Queue processing tests (Phase 2)
// =============================================================================

describe('scrapeAllFeeds - Phase 2 (queue processing)', () => {
  // Helper: set up a single feed with one entry for queue processing tests
  function setupSingleEntry(realUrl) {
    const gLink = googleLink(realUrl);
    mockParseURL
      .mockResolvedValueOnce({ items: [makeEntry(gLink, 'Test Title', 'Test snippet for classification')] })
      .mockResolvedValueOnce({ items: [] });
  }

  test('normal processing flow: extract URL, fetch content, insert raw, submit classification', async () => {
    setupSingleEntry('https://example.com/normal-article');

    await scrapeAllFeeds();

    // Raw document inserted
    expect(mockRawCreate).toHaveBeenCalledTimes(1);
    const rawDoc = mockRawCreate.mock.calls[0][0];
    expect(rawDoc.platform).toBe('google-alerts');
    expect(rawDoc.extractedUrl).toBe('https://example.com/normal-article');
    expect(rawDoc.keyword).toBe('Stryker');
    expect(rawDoc.query).toBe('Stryker');
    expect(rawDoc.id).toBe(docIdFromUrl('https://example.com/normal-article'));

    // Classification submitted
    expect(mockSubmitJob).toHaveBeenCalledTimes(1);
    const submittedData = mockSubmitJob.mock.calls[0][0];
    expect(submittedData.platform).toBe('google-alerts');
    expect(submittedData.extractedUrl).toBe('https://example.com/normal-article');
  });

  test('uses full content when Readability succeeds', async () => {
    setupSingleEntry('https://example.com/readable-article');

    const fullText = 'This is the full article content extracted by Readability. It needs to be over one hundred characters long to pass the threshold check in the service implementation.';
    mockReadabilityParse.mockReturnValue({ textContent: fullText });

    await scrapeAllFeeds();

    const rawDoc = mockRawCreate.mock.calls[0][0];
    expect(rawDoc.contentSource).toBe('full');
    expect(rawDoc.content).toBe(fullText);
    expect(rawDoc.fullContent).toBe(fullText);
  });

  test('falls back to snippet when Readability returns short content', async () => {
    setupSingleEntry('https://example.com/short-article');

    mockReadabilityParse.mockReturnValue({ textContent: 'Too short' }); // < 100 chars

    await scrapeAllFeeds();

    const rawDoc = mockRawCreate.mock.calls[0][0];
    expect(rawDoc.contentSource).toBe('snippet');
    expect(rawDoc.fullContent).toBeNull();
  });

  test('falls back to snippet when fetch fails (network error)', async () => {
    setupSingleEntry('https://example.com/fetch-fail');

    global.fetch.mockRejectedValue(new Error('Connection refused'));

    await scrapeAllFeeds();

    const rawDoc = mockRawCreate.mock.calls[0][0];
    expect(rawDoc.contentSource).toBe('snippet');
    expect(rawDoc.fullContent).toBeNull();
  });

  test('falls back to snippet when page returns non-HTML content type', async () => {
    setupSingleEntry('https://example.com/pdf-article');

    global.fetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/pdf' },
      text: () => Promise.resolve(''),
    });

    await scrapeAllFeeds();

    const rawDoc = mockRawCreate.mock.calls[0][0];
    expect(rawDoc.contentSource).toBe('snippet');
  });

  test('falls back to snippet when page returns non-OK status', async () => {
    setupSingleEntry('https://example.com/forbidden');

    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'text/html' },
    });

    await scrapeAllFeeds();

    const rawDoc = mockRawCreate.mock.calls[0][0];
    expect(rawDoc.contentSource).toBe('snippet');
  });

  test('skips item when URL cannot be extracted from Google link', async () => {
    // Feed entry with a bad link (no url param)
    mockParseURL
      .mockResolvedValueOnce({
        items: [makeEntry('https://www.google.com/url?rct=j&sa=t&ct=ga', 'Bad Link')],
      })
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    expect(mockRawCreate).not.toHaveBeenCalled();
    expect(mockSubmitJob).not.toHaveBeenCalled();
  });

  test('skips item when URL is in NOT websites blocklist', async () => {
    setupSingleEntry('https://www.blocked.com/article');

    await scrapeAllFeeds();

    expect(mockRawCreate).not.toHaveBeenCalled();
    expect(mockSubmitJob).not.toHaveBeenCalled();
  });

  test('skips item when URL is already in raw container (URL-based dedup)', async () => {
    setupSingleEntry('https://example.com/already-seen');

    // Dedup check: doc already exists
    mockRawItemRead.mockResolvedValue({ resource: { id: 'existing-doc' } });

    await scrapeAllFeeds();

    expect(mockRawCreate).not.toHaveBeenCalled();
    expect(mockSubmitJob).not.toHaveBeenCalled();
  });

  test('handles 409 race condition on raw insert (treat as duplicate)', async () => {
    setupSingleEntry('https://example.com/race-condition');

    const cosmosError = new Error('Conflict');
    cosmosError.code = 409;
    mockRawCreate.mockRejectedValue(cosmosError);

    await scrapeAllFeeds();

    // Insert attempted but failed with 409 — no classification
    expect(mockRawCreate).toHaveBeenCalledTimes(1);
    expect(mockSubmitJob).not.toHaveBeenCalled();
  });

  test('handles raw insert failure (non-409 error)', async () => {
    setupSingleEntry('https://example.com/db-error');

    const cosmosError = new Error('Internal server error');
    cosmosError.code = 500;
    mockRawCreate.mockRejectedValue(cosmosError);

    await scrapeAllFeeds();

    expect(mockRawCreate).toHaveBeenCalledTimes(1);
    expect(mockSubmitJob).not.toHaveBeenCalled();
  });

  test('handles worker pool being full (returns null)', async () => {
    setupSingleEntry('https://example.com/pool-full');

    mockSubmitJob.mockReturnValue(null); // Pool full

    await scrapeAllFeeds();

    // Raw doc still inserted, just classification skipped
    expect(mockRawCreate).toHaveBeenCalledTimes(1);
    expect(mockSubmitJob).toHaveBeenCalledTimes(1);
  });

  test('processes multiple items from multiple feeds', async () => {
    const link1 = googleLink('https://example.com/art-1');
    const link2 = googleLink('https://example.com/art-2');
    const link3 = googleLink('https://example.com/art-3');

    // Feed 1: 2 entries, Feed 2: 1 entry
    mockParseURL
      .mockResolvedValueOnce({ items: [makeEntry(link1), makeEntry(link2)] })
      .mockResolvedValueOnce({ items: [makeEntry(link3)] });

    await scrapeAllFeeds();

    expect(mockRawCreate).toHaveBeenCalledTimes(3);
    expect(mockSubmitJob).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// Classification result handler tests
// =============================================================================

describe('scrapeAllFeeds - classification handler', () => {
  function setupSingleEntry(realUrl) {
    const gLink = googleLink(realUrl);
    mockParseURL
      .mockResolvedValueOnce({ items: [makeEntry(gLink, 'Test Title', 'Test snippet')] })
      .mockResolvedValueOnce({ items: [] });
  }

  test('writes to processed container when classification matches', async () => {
    setupSingleEntry('https://example.com/matched');

    // Capture the callback passed to submitJob
    let capturedCallback;
    mockSubmitJob.mockImplementation((data, callback) => {
      capturedCallback = { data, callback };
      return 'mock-job-id';
    });

    await scrapeAllFeeds();

    expect(capturedCallback).toBeDefined();

    // Simulate a matched classification result
    await capturedCallback.callback(
      null,
      {
        matched: true,
        method: 'BrandQuery',
        classification: {
          topic: 'Hip',
          subTopic: 'Rejuvenate',
          queryName: 'English',
          internalId: 'test-internal-id',
        },
        relevantByModel: true,
      },
      capturedCallback.data
    );

    expect(mockProcessedCreate).toHaveBeenCalledTimes(1);
    const processed = mockProcessedCreate.mock.calls[0][0];
    expect(processed.topic).toBe('Hip');
    expect(processed.subTopic).toBe('Rejuvenate');
    expect(processed.queryName).toBe('English');
    expect(processed.internalId).toBe('test-internal-id');
    expect(processed.relevantByModel).toBe(true);
    expect(processed.platform).toBe('google-alerts');
    expect(processed.classifiedAt).toBeDefined();
  });

  test('does NOT write to processed container when classification does not match', async () => {
    setupSingleEntry('https://example.com/not-matched');

    let capturedCallback;
    mockSubmitJob.mockImplementation((data, callback) => {
      capturedCallback = { data, callback };
      return 'mock-job-id';
    });

    await scrapeAllFeeds();

    await capturedCallback.callback(null, { matched: false }, capturedCallback.data);

    expect(mockProcessedCreate).not.toHaveBeenCalled();
  });

  test('handles classification error gracefully', async () => {
    setupSingleEntry('https://example.com/error');

    let capturedCallback;
    mockSubmitJob.mockImplementation((data, callback) => {
      capturedCallback = { data, callback };
      return 'mock-job-id';
    });

    await scrapeAllFeeds();

    // Simulate classification error
    await capturedCallback.callback(
      new Error('Classification failed'),
      null,
      capturedCallback.data
    );

    expect(mockProcessedCreate).not.toHaveBeenCalled();
  });

  test('handles processed container 409 conflict gracefully', async () => {
    setupSingleEntry('https://example.com/conflict');

    let capturedCallback;
    mockSubmitJob.mockImplementation((data, callback) => {
      capturedCallback = { data, callback };
      return 'mock-job-id';
    });

    const cosmosError = new Error('Conflict');
    cosmosError.code = 409;
    mockProcessedCreate.mockRejectedValue(cosmosError);

    await scrapeAllFeeds();

    // Should not throw — just log
    await expect(
      capturedCallback.callback(
        null,
        {
          matched: true,
          method: 'BrandQuery',
          classification: { topic: 'T', subTopic: 'S', queryName: 'Q', internalId: 'I' },
          relevantByModel: false,
        },
        capturedCallback.data
      )
    ).resolves.not.toThrow();
  });

  test('handles null result gracefully', async () => {
    setupSingleEntry('https://example.com/null-result');

    let capturedCallback;
    mockSubmitJob.mockImplementation((data, callback) => {
      capturedCallback = { data, callback };
      return 'mock-job-id';
    });

    await scrapeAllFeeds();

    await capturedCallback.callback(null, null, capturedCallback.data);

    expect(mockProcessedCreate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Overlap prevention
// =============================================================================

describe('scrapeAllFeeds - overlap prevention', () => {
  test('skips cycle when a scrape is already in progress', async () => {
    const link = googleLink('https://example.com/slow');

    // Make the first scrapeAllFeeds take a while
    let resolveSlowParse;
    const slowPromise = new Promise(r => { resolveSlowParse = r; });
    mockParseURL
      .mockReturnValueOnce(slowPromise)   // Stryker: slow
      .mockResolvedValue({ items: [] });   // everything else: empty

    // Start first scrape (will hang waiting for slowPromise)
    const firstScrape = scrapeAllFeeds();

    // While first is still running, trigger a second one
    await scrapeAllFeeds(); // Should return immediately (overlap guard)

    // Resolve the slow feed to let the first scrape finish
    resolveSlowParse({ items: [makeEntry(link)] });
    await firstScrape;

    // parseURL should only have been called for the FIRST scrape cycle's feeds
    // The second scrape should have been skipped entirely
    // 2 feeds in config = 2 parseURL calls for the first cycle only
    expect(mockParseURL).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// Deduplication tests (end-to-end scenarios)
// =============================================================================

describe('scrapeAllFeeds - deduplication', () => {
  test('second scrape with same topmost entry produces no new items', async () => {
    const link = googleLink('https://example.com/dedup-test');

    // First scrape: Stryker has entry, Test Product empty
    mockParseURL
      .mockResolvedValueOnce({ items: [makeEntry(link)] })   // Stryker
      .mockResolvedValueOnce({ items: [] });                  // Test Product

    await scrapeAllFeeds();
    expect(mockRawCreate).toHaveBeenCalledTimes(1);

    // Reset all mocks and re-configure defaults for the second scrape
    jest.clearAllMocks();
    mockRawItemRead.mockRejectedValue({ code: 404 });
    mockRawCreate.mockResolvedValue({});
    mockStateUpsert.mockResolvedValue({});
    mockSubmitJob.mockReturnValue('mock-job-id');

    // State now reflects what the first scrape saved
    mockStateQueryFetchAll.mockResolvedValue({
      resources: [
        { id: stateId('Stryker'), feedName: 'Stryker', lastLinkHash: linkHash(link) },
        { id: stateId('Test Product'), feedName: 'Test Product', lastLinkHash: null },
      ],
    });

    // Second scrape: same entries as before
    mockParseURL
      .mockResolvedValueOnce({ items: [makeEntry(link)] })   // Stryker (unchanged)
      .mockResolvedValueOnce({ items: [] });                  // Test Product (still empty)

    await scrapeAllFeeds();

    // No new items should be created
    expect(mockRawCreate).not.toHaveBeenCalled();
  });

  test('same URL appearing across different feeds is only processed once', async () => {
    const sharedUrl = 'https://example.com/shared-article';
    const sharedLink = googleLink(sharedUrl);

    // Both feeds return the same article
    mockParseURL
      .mockResolvedValueOnce({ items: [makeEntry(sharedLink)] })
      .mockResolvedValueOnce({ items: [makeEntry(sharedLink)] });

    // First insertion succeeds, second dedup check finds existing doc
    mockRawItemRead
      .mockRejectedValueOnce({ code: 404 })  // First: not found → proceed
      .mockResolvedValueOnce({ resource: { id: docIdFromUrl(sharedUrl) } }); // Second: found → skip

    await scrapeAllFeeds();

    // Raw create should only be called once
    expect(mockRawCreate).toHaveBeenCalledTimes(1);
    expect(mockSubmitJob).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Scraper lifecycle tests
// =============================================================================

describe('scraper lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    stopGoogleAlertsScraper(); // Ensure cleanup
    jest.useRealTimers();
  });

  test('startGoogleAlertsScraper sets up interval', () => {
    const interval = startGoogleAlertsScraper();
    expect(interval).toBeDefined();
  });

  test('stopGoogleAlertsScraper clears the interval', () => {
    startGoogleAlertsScraper();
    stopGoogleAlertsScraper();
    // Should be safe to call twice
    stopGoogleAlertsScraper();
  });

  test('getScraperStatus returns expected structure', () => {
    const status = getScraperStatus();
    expect(status).toHaveProperty('isRunning');
    expect(status).toHaveProperty('lastScrapeAt');
    expect(status).toHaveProperty('lastScrapeStats');
    expect(status).toHaveProperty('totalFeeds', 2); // 2 mocked feeds
    expect(status).toHaveProperty('blockedWebsites', 2); // 2 mocked blocked domains
  });
});

// =============================================================================
// Stats tracking
// =============================================================================

describe('scrapeAllFeeds - stats tracking', () => {
  test('records correct stats after a full cycle', async () => {
    const link1 = googleLink('https://example.com/stat-1');
    const blockedLink = googleLink('https://www.blocked.com/blocked-article');

    mockParseURL
      .mockResolvedValueOnce({
        items: [
          makeEntry(link1, 'Good Article'),
          makeEntry(blockedLink, 'Blocked Article'),
        ],
      })
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    const status = getScraperStatus();
    expect(status.lastScrapeAt).not.toBeNull();
    expect(status.lastScrapeStats).toBeDefined();
    expect(status.lastScrapeStats.feedsScraped).toBe(2);
    expect(status.lastScrapeStats.feedsWithNew).toBe(1);
    expect(status.lastScrapeStats.feedsUnchanged).toBe(1);
    expect(status.lastScrapeStats.itemsQueued).toBe(2);
    expect(status.lastScrapeStats.skippedNotWebsite).toBe(1);
    expect(status.lastScrapeStats.rawInserted).toBe(1);
    expect(status.lastScrapeStats.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('records zero stats for an empty cycle', async () => {
    mockParseURL.mockResolvedValue({ items: [] });

    await scrapeAllFeeds();

    const status = getScraperStatus();
    expect(status.lastScrapeStats.feedsScraped).toBe(2);
    expect(status.lastScrapeStats.feedsWithNew).toBe(0);
    expect(status.lastScrapeStats.feedsUnchanged).toBe(2);
    expect(status.lastScrapeStats.itemsQueued).toBe(0);
    expect(status.lastScrapeStats.rawInserted).toBe(0);
  });

  test('records failed feeds in stats', async () => {
    mockParseURL
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ items: [] });

    await scrapeAllFeeds();

    const status = getScraperStatus();
    expect(status.lastScrapeStats.feedsFailed).toBe(1);
  });
});

// =============================================================================
// Route tests
// =============================================================================

describe('Google Alerts API Routes', () => {
  const express = require('express');
  const request = require('supertest');
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/google-alerts', require('../routes/googleAlerts'));
    // Also mount health route
    app.use('/api/health', require('../routes/health'));
  });

  describe('GET /api/google-alerts', () => {
    test('returns paginated raw items', async () => {
      mockRawQueryFetchAll.mockResolvedValue({ resources: [{ id: '1' }, { id: '2' }] });

      const res = await request(app).get('/api/google-alerts?page=1&limit=10').expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });

    test('uses default pagination when not specified', async () => {
      mockRawQueryFetchAll.mockResolvedValue({ resources: [] });

      const res = await request(app).get('/api/google-alerts').expect(200);

      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });

    test('returns 500 on database error', async () => {
      mockRawQueryFetchAll.mockRejectedValue(new Error('DB error'));

      await request(app).get('/api/google-alerts').expect(500);
    });
  });

  describe('GET /api/google-alerts/processed', () => {
    test('returns paginated processed items', async () => {
      mockProcessedQueryFetchAll.mockResolvedValue({ resources: [{ id: '1', topic: 'Test' }] });

      const res = await request(app).get('/api/google-alerts/processed?page=2&limit=5').expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(5);
    });

    test('returns 500 on database error', async () => {
      mockProcessedQueryFetchAll.mockRejectedValue(new Error('DB error'));

      await request(app).get('/api/google-alerts/processed').expect(500);
    });
  });

  describe('GET /api/google-alerts/state', () => {
    test('returns all feed states with scraper status', async () => {
      mockStateQueryFetchAll.mockResolvedValue({
        resources: [
          { id: 'abc', feedName: 'Stryker', lastLinkHash: 'hash1', lastScrapedAt: '2026-01-01T00:00:00Z' },
        ],
      });

      const res = await request(app).get('/api/google-alerts/state').expect(200);

      expect(res.body.feeds).toHaveLength(1);
      expect(res.body.feeds[0].feedName).toBe('Stryker');
      expect(res.body.scraperStatus).toBeDefined();
      expect(res.body.scraperStatus.totalFeeds).toBe(2);
    });

    test('returns 500 on database error', async () => {
      mockStateQueryFetchAll.mockRejectedValue(new Error('DB error'));

      await request(app).get('/api/google-alerts/state').expect(500);
    });
  });

  describe('POST /api/google-alerts/trigger', () => {
    test('triggers a scrape cycle and returns status', async () => {
      // Make sure feeds return quickly
      mockParseURL.mockResolvedValue({ items: [] });

      const res = await request(app).post('/api/google-alerts/trigger').expect(200);

      expect(res.body.message).toBe('Scrape cycle triggered');
      expect(res.body.status).toBeDefined();
    });
  });

  describe('DELETE /api/google-alerts/:id', () => {
    test('deletes item successfully', async () => {
      mockRawItemDelete.mockResolvedValue({});

      const res = await request(app).delete('/api/google-alerts/test-id-123').expect(200);

      expect(res.body.message).toBe('Item deleted successfully');
      expect(res.body.id).toBe('test-id-123');
    });

    test('returns 404 when item not found', async () => {
      const cosmosError = new Error('Not found');
      cosmosError.code = 404;
      mockRawItemDelete.mockRejectedValue(cosmosError);

      await request(app).delete('/api/google-alerts/nonexistent').expect(404);
    });

    test('returns 500 on unexpected error', async () => {
      mockRawItemDelete.mockRejectedValue(new Error('Internal error'));

      await request(app).delete('/api/google-alerts/error-id').expect(500);
    });
  });

  describe('GET /api/health', () => {
    test('includes Google Alerts status in health response', async () => {
      const res = await request(app).get('/api/health').expect(200);

      expect(res.body.status).toBe('OK');
      expect(res.body.services.googleAlerts).toBeDefined();
      expect(res.body.services.googleAlerts.totalFeeds).toBe(2);
      expect(res.body.services.googleAlerts.blockedWebsites).toBe(2);
    });
  });
});
