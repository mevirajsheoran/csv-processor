jest.mock('../../src/services/kafka.producer', () => ({
  connect: jest.fn(),
  publishUploadEvent: jest.fn(),
  isConnected: jest.fn(() => true),
  disconnect: jest.fn(),
}));

jest.mock('../../src/services/cache.service', () => ({
  connect: jest.fn(),
  getRecords: jest.fn(),
  setRecords: jest.fn(),
  isConnected: jest.fn(() => true),
  getClient: jest.fn(() => ({ ping: jest.fn(), on: jest.fn(), status: 'ready' })),
  disconnect: jest.fn(),
  CACHE_KEY: 'csv-processor:records:all',
}));

jest.mock('../../src/services/database.service', () => ({
  bulkUpsert: jest.fn(),
  getAllRecords: jest.fn(),
  buildBulkUpsertQuery: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const databaseService = require('../../src/services/database.service');
const kafkaProducer = require('../../src/services/kafka.producer');

describe('Upload Controller', () => {
  describe('POST /api/upload', () => {
    test('should return 200 with correct data on successful upload', async () => {
      databaseService.bulkUpsert.mockResolvedValueOnce({
        inserted: 2,
        updated: 0,
        total: 2,
      });
      kafkaProducer.publishUploadEvent.mockResolvedValueOnce(true);

      const csvContent = 'sku,name,description,category,price,quantity\nSKU001,Widget,Desc,Cat,29.99,100\nSKU002,Gadget,Desc,Cat,49.99,50';

      const res = await request(app)
        .post('/api/upload')
        .attach('file', Buffer.from(csvContent), 'products.csv');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalRecords).toBe(2);
      expect(res.body.data.inserted).toBe(2);
      expect(res.body.data.updated).toBe(0);
      expect(res.body.data.kafkaPublished).toBe(true);
      expect(res.body.data.uploadId).toBeDefined();
      expect(res.body.data.fileName).toBe('products.csv');
    });

    test('should return 400 when no file is attached', async () => {
      const res = await request(app)
        .post('/api/upload');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('should return 400 when CSV validation fails', async () => {
      const csvContent = 'sku,name,description,category,price,quantity\n,,,,,';

      const res = await request(app)
        .post('/api/upload')
        .attach('file', Buffer.from(csvContent), 'bad.csv');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    test('should return 200 with kafkaPublished false when Kafka fails', async () => {
      databaseService.bulkUpsert.mockResolvedValueOnce({
        inserted: 1,
        updated: 0,
        total: 1,
      });
      kafkaProducer.publishUploadEvent.mockResolvedValueOnce(false);

      const csvContent = 'sku,name,description,category,price,quantity\nSKU001,Widget,Desc,Cat,29.99,100';

      const res = await request(app)
        .post('/api/upload')
        .attach('file', Buffer.from(csvContent), 'products.csv');

      expect(res.status).toBe(200);
      expect(res.body.data.kafkaPublished).toBe(false);
    });

    test('should return 500 when database fails', async () => {
      databaseService.bulkUpsert.mockRejectedValueOnce(
        new Error('Connection lost')
      );

      const csvContent = 'sku,name,description,category,price,quantity\nSKU001,Widget,Desc,Cat,29.99,100';

      const res = await request(app)
        .post('/api/upload')
        .attach('file', Buffer.from(csvContent), 'products.csv');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});