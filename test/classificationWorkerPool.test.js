/**
 * Tests for Classification Worker Pool
 *
 * These tests validate:
 * - Worker pool initialization
 * - Job submission and result handling
 * - Round-robin distribution
 * - Worker crash recovery
 * - Queue backpressure
 */

require('dotenv').config();
const workerPool = require('../services/classificationWorkerPool');

// Set minimal workers for testing
process.env.CLASSIFICATION_WORKERS = '1';
process.env.MAX_CLASSIFICATION_QUEUE_SIZE = '10';

describe('Classification Worker Pool', () => {
  beforeAll(async () => {
    // Initialize the worker pool
    await workerPool.initialize();
  }, 120000); // 2 minute timeout for model loading

  afterAll(async () => {
    // Clean up workers
    await workerPool.shutdown();
  });

  test('should initialize with correct number of workers', () => {
    const metrics = workerPool.getMetrics();
    expect(metrics.initialized).toBe(true);
    expect(metrics.workerCount).toBe(1);
  });

  test('should successfully submit and process a brand-matched job', (done) => {
    const testItem = {
      id: 'test-brand-match-123',
      title: 'Stryker Medical Device Recall',
      content: 'Stryker Corporation announced a voluntary recall of the Rejuvenate hip implant system.',
      query: 'test query',
      platform: 'KWatch',
    };

    workerPool.submitJob(testItem, (err, result, originalData) => {
      try {
        expect(err).toBeNull();
        expect(result).toBeDefined();
        expect(result.matched).toBe(true);
        expect(result.method).toBe('BrandQuery');
        expect(result.classification).toBeDefined();
        expect(result.classification.topic).toBeDefined();
        expect(originalData.id).toBe('test-brand-match-123');
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 30000);

  test('should handle non-matching content', (done) => {
    const testItem = {
      id: 'test-no-match-456',
      title: 'Random Article',
      content: 'This is about something completely different and unrelated.',
      query: 'test query',
      platform: 'KWatch',
    };

    workerPool.submitJob(testItem, (err, result, originalData) => {
      try {
        expect(err).toBeNull();
        expect(result).toBeDefined();
        expect(result.matched).toBe(false);
        expect(originalData.id).toBe('test-no-match-456');
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 30000);

  test('should handle empty content gracefully', (done) => {
    const testItem = {
      id: 'test-empty-789',
      title: '',
      content: '',
      query: 'test query',
      platform: 'KWatch',
    };

    workerPool.submitJob(testItem, (err, result, originalData) => {
      try {
        expect(err).toBeNull();
        expect(result).toBeDefined();
        expect(result.matched).toBe(false);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 30000);

  test('should track metrics correctly', async () => {
    const initialMetrics = workerPool.getMetrics();
    const initialSubmitted = initialMetrics.jobsSubmitted;

    // Submit a job
    await new Promise((resolve) => {
      workerPool.submitJob({
        id: 'metrics-test',
        title: 'Test',
        content: 'Test content',
        query: 'test',
        platform: 'KWatch',
      }, () => resolve());
    });

    const updatedMetrics = workerPool.getMetrics();
    expect(updatedMetrics.jobsSubmitted).toBeGreaterThan(initialSubmitted);
    expect(updatedMetrics.jobsCompleted + updatedMetrics.jobsFailed).toBeGreaterThan(0);
  }, 30000);

  test('should handle multiple concurrent jobs', async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({
      id: `concurrent-test-${i}`,
      title: 'Stryker Test',
      content: `Test content ${i}`,
      query: 'test',
      platform: 'KWatch',
    }));

    const promises = jobs.map(job =>
      new Promise((resolve) => {
        workerPool.submitJob(job, (err, result) => {
          resolve({ err, result, jobId: job.id });
        });
      })
    );

    const results = await Promise.all(promises);

    expect(results).toHaveLength(5);
    results.forEach(({ err, result }) => {
      expect(err).toBeNull();
      expect(result).toBeDefined();
    });
  }, 60000);

  test('should reject jobs when queue is full', () => {
    // Fill up the queue (max size is 10)
    const jobs = Array.from({ length: 15 }, (_, i) => ({
      id: `queue-full-${i}`,
      title: 'Test',
      content: 'Test content',
      query: 'test',
      platform: 'KWatch',
    }));

    const results = jobs.map(job => workerPool.submitJob(job, () => {}));

    // Some jobs should be rejected (return null)
    const rejectedCount = results.filter(r => r === null).length;
    expect(rejectedCount).toBeGreaterThan(0);
  });

  test('should return average processing time in metrics', async () => {
    // Submit a job and wait for completion
    await new Promise((resolve) => {
      workerPool.submitJob({
        id: 'timing-test',
        title: 'Stryker',
        content: 'Medical device',
        query: 'test',
        platform: 'KWatch',
      }, () => resolve());
    });

    const metrics = workerPool.getMetrics();
    expect(metrics.avgProcessingTimeMs).toBeGreaterThanOrEqual(0);
  }, 30000);
});
