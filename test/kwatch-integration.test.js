/**
 * Integration Tests for KWatch with Worker Pool
 *
 * These tests validate the complete flow:
 * 1. Webhook receives data
 * 2. Item queued
 * 3. Batch processor inserts to raw container
 * 4. Worker classifies item
 * 5. Result written to processed container
 */

require('dotenv').config();
const request = require('supertest');
const { kwatchContainer, kwatchProcessedContainer } = require('../config/database');
const workerPool = require('../services/classificationWorkerPool');

// We'll need to start the server for integration tests
const express = require('express');
const cors = require('cors');
const routes = require('../routes');
const { startQueueProcessor } = require('../services/kwatchQueue');

let app;
let server;
let queueInterval;

beforeAll(async () => {
  // Set minimal workers for testing to avoid threading issues
  process.env.CLASSIFICATION_WORKERS = '1';
  
  // Set up express app
  app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', routes);

  // Initialize worker pool (workers will initialize their own classifiers)
  await workerPool.initialize();

  // Start queue processor (every 5 seconds for faster testing)
  queueInterval = setInterval(
    require('../services/kwatchQueue').processKWatchQueue || (() => {}),
    5000
  );

  // Start server
  server = app.listen(3001);
}, 120000);

afterAll(async () => {
  // Clean up
  if (queueInterval) clearInterval(queueInterval);
  await workerPool.shutdown();
  if (server) server.close();
}, 30000);

describe('KWatch Integration with Workers', () => {
  const testId = `integration-test-${Date.now()}`;

  test('should accept webhook POST and return 200 immediately', async () => {
    const payload = {
      platform: 'KWatch',
      query: 'test query',
      datetime: new Date().toISOString(),
      link: 'https://example.com/test',
      author: 'Test Author',
      title: 'Stryker Medical Device Update',
      content: 'Stryker Corporation has announced new updates to their Mako robotic surgery system for joint replacement procedures.',
      sentiment: 'neutral',
    };

    const response = await request(app)
      .post('/api/webhook/kwatch')
      .send(payload)
      .expect(200);

    expect(response.body.message).toBe('Notification received');
  });

  test('should process item and write to raw container', async () => {
    const testContent = `Test content for raw container ${Date.now()}`;
    const payload = {
      platform: 'KWatch',
      query: 'test query',
      datetime: new Date().toISOString(),
      link: 'https://example.com/raw-test',
      author: 'Test Author',
      title: 'Stryker Test',
      content: testContent,
      sentiment: 'neutral',
    };

    // Send webhook
    await request(app)
      .post('/api/webhook/kwatch')
      .send(payload)
      .expect(200);

    // Wait for batch processor (5 seconds interval + more buffer)
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check if item exists in raw container
    const crypto = require('crypto');
    const itemId = crypto.createHash('md5').update(testContent).digest('hex');

    try {
      // Use hierarchical partition key: [platform, id]
      const { resource } = await kwatchContainer.item(itemId, ['KWatch', itemId]).read();
      expect(resource).toBeDefined();
      expect(resource.content).toBe(testContent);
      expect(resource.platform).toBe(payload.platform);
      expect(resource.query).toBe(payload.query);
      expect(resource.link).toBe(payload.link);
      expect(resource.author).toBe(payload.author);
      expect(resource.title).toBe(payload.title);
      expect(resource.sentiment).toBe(payload.sentiment);
      expect(resource.isDuplicate).toBe(false);
    } catch (err) {
      // Fail the test if item wasn't inserted
      throw new Error(`Core test failed: Item not written to raw container - ${err.message}`);
    }
  }, 20000);

  test('should classify item and write to processed container', async () => {
    const testContent = `Stryker Rejuvenate hip implant recall ${Date.now()}`;
    const payload = {
      platform: 'KWatch',
      query: 'hip implant',
      datetime: new Date().toISOString(),
      link: 'https://example.com/processed-test',
      author: 'Medical News',
      title: 'Hip Implant Safety Alert',
      content: testContent,
      sentiment: 'negative',
    };

    // Send webhook
    await request(app)
      .post('/api/webhook/kwatch')
      .send(payload)
      .expect(200);

    // Wait for batch processor + worker classification (10 seconds)
    await new Promise(resolve => setTimeout(resolve, 12000));

    // Check if item exists in processed container
    const crypto = require('crypto');
    const itemId = crypto.createHash('md5').update(testContent).digest('hex');

    try {
      // Use hierarchical partition key: [platform, id]
      const { resource } = await kwatchProcessedContainer.item(itemId, ['KWatch', itemId]).read();
      expect(resource).toBeDefined();
      expect(resource.content).toBe(testContent);
      expect(resource.platform).toBe(payload.platform);
      expect(resource.query).toBe(payload.query);
      expect(resource.link).toBe(payload.link);
      expect(resource.author).toBe(payload.author);
      expect(resource.title).toBe(payload.title);
      expect(resource.sentiment).toBe(payload.sentiment);
      
      // Should have classification
      expect(resource.topic).toBeDefined();
      expect(resource.subTopic).toBeDefined();
      expect(resource.queryName).toBeDefined();
      expect(resource.internalId).toBeDefined();
      expect(typeof resource.queryName).toBe('string');
      expect(resource.queryName.length).toBeGreaterThan(0);
    } catch (err) {
      // Fail the test if item wasn't classified and written
      throw new Error(`Core test failed: Item not classified and written to processed container - ${err.message}`);
    }
  }, 20000);

  test('should handle missing required fields with 400 error', async () => {
    const payload = {
      platform: 'KWatch',
      // Missing required fields
    };

    await request(app)
      .post('/api/webhook/kwatch')
      .send(payload)
      .expect(400);
  });

  test('should return health status including worker pool metrics', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);

    expect(response.body.status).toBe('OK');
    expect(response.body.services.workerPool).toBeDefined();
    expect(response.body.services.workerPool.initialized).toBe(true);
    expect(response.body.services.workerPool.workerCount).toBeGreaterThan(0);
  });

  test('should classify via relevancy model when brand query fails', async () => {
    // This content should NOT match any brand query but SHOULD be relevant
    const testContent = `The Mako robotic arm system is revolutionary for knee surgery procedures ${Date.now()}`;
    const payload = {
      platform: 'KWatch',
      query: 'Mako Surgery Test',
      datetime: new Date().toISOString(),
      link: 'https://example.com/relevancy-test',
      author: 'Medical Test',
      title: 'Robotic Surgery Innovation',
      content: testContent,
      sentiment: 'positive',
    };

    // Send webhook
    await request(app)
      .post('/api/webhook/kwatch')
      .send(payload)
      .expect(200);

    // Wait for batch processor + worker classification
    await new Promise(resolve => setTimeout(resolve, 12000));

    // Check if item exists in processed container
    const crypto = require('crypto');
    const itemId = crypto.createHash('md5').update(testContent).digest('hex');

    try {
      // Use hierarchical partition key: [platform, id]
      const { resource } = await kwatchProcessedContainer.item(itemId, ['KWatch', itemId]).read();
      expect(resource).toBeDefined();
      expect(resource.content).toBe(testContent);
      expect(resource.platform).toBe(payload.platform);
      expect(resource.query).toBe(payload.query);
      expect(resource.link).toBe(payload.link);
      expect(resource.author).toBe(payload.author);
      expect(resource.title).toBe(payload.title);
      expect(resource.sentiment).toBe(payload.sentiment);
      
      // Should be classified by relevancy model
      expect(resource.topic).toBe('General-RelevancyClassification');
      expect(resource.queryName).toBe('RelevancyClassification');
      expect(resource.subTopic).toBe('Mako Surgery Test'); // Extracted from query
      expect(resource.internalId).toBe('74747474747474747474747474747474'); // Relevancy classification ID
      expect(resource.relevantByModel).toBe(true);
    } catch (err) {
      // Fail the test if relevancy classification didn't work
      throw new Error(`Core test failed: Relevancy classification failed - ${err.message}`);
    }
  }, 20000);

  test('should handle duplicate content correctly', async () => {
    const duplicateContent = `Duplicate test content ${Date.now()}`;
    const payload = {
      platform: 'KWatch',
      query: 'duplicate test',
      datetime: new Date().toISOString(),
      link: 'https://example.com/dup1',
      author: 'Author 1',
      title: 'Test',
      content: duplicateContent,
      sentiment: 'neutral',
    };

    // Send first webhook
    await request(app)
      .post('/api/webhook/kwatch')
      .send(payload)
      .expect(200);

    // Send duplicate with different metadata
    const duplicate = {
      ...payload,
      link: 'https://example.com/dup2',
      author: 'Author 2',
    };

    await request(app)
      .post('/api/webhook/kwatch')
      .send(duplicate)
      .expect(200);

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check that at least one item with this content exists in database
    // Note: The original ID might have either the first or second author
    // since duplicates generate new unique IDs
    const crypto = require('crypto');
    const originalId = crypto.createHash('md5').update(duplicateContent).digest('hex');

    try {
      // Use hierarchical partition key: [platform, id]
      const { resource } = await kwatchContainer.item(originalId, ['KWatch', originalId]).read();
      expect(resource).toBeDefined();
      expect(resource.content).toBe(duplicateContent);
      expect(resource.platform).toBe(payload.platform);
      expect(resource.query).toBe(payload.query);
      expect(resource.sentiment).toBe(payload.sentiment);
      // Author could be either 'Author 1' or 'Author 2' depending on which one got this ID
      expect(['Author 1', 'Author 2']).toContain(resource.author);
    } catch (err) {
      // Fail the test if duplicate handling didn't work
      throw new Error(`Core test failed: Duplicate handling failed - ${err.message}`);
    }
  }, 20000);
});
