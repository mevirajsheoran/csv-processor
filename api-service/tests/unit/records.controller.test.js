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
  getClient: jest.fn(() => ({ ping: jest.fn(), on: jest.fn() })),
  disconnect: jest.fn(),
}));

jest.mock('../../src/services/database.service');

const request = require('supertest');
const app = require('../../src/app');
const cacheService = require('../../src/services/cache.service');
const databaseService = require('../../src/services/database.service');

describe('Records Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/records', () => {
    const mockRecords = [
      { id: 1, sku: 'SKU001', name: 'Widget', price: 29.99, quantity: 100 },
      { id: 2, sku: 'SKU002', name: 'Gadget', price: 49.99, quantity: 50 },
    ];

    it('should return records from cache with source "cache"', async () => {
      cacheService.getRecords.mockResolvedValueOnce(mockRecords);

      const res = await request(app).get('/api/records');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.records).toEqual(mockRecords);
      expect(res.body.data.count).toBe(2);
      expect(res.body.meta.source).toBe('cache');
      expect(databaseService.getAllRecords).not.toHaveBeenCalled();
    });

    it('should return records from database with source "database" on cache miss', async () => {
      cacheService.getRecords.mockResolvedValueOnce(null);
      databaseService.getAllRecords.mockResolvedValueOnce(mockRecords);
      cacheService.setRecords.mockResolvedValueOnce();

      const res = await request(app).get('/api/records');

      expect(res.status).toBe(200);
      expect(res.body.data.records).toEqual(mockRecords);
      expect(res.body.meta.source).toBe('database');
      expect(databaseService.getAllRecords).toHaveBeenCalledTimes(1);
    });

    it('should return records from database when Redis is down', async () => {
      cacheService.getRecords.mockResolvedValueOnce(null);
      databaseService.getAllRecords.mockResolvedValueOnce(mockRecords);
      cacheService.setRecords.mockResolvedValueOnce();

      const res = await request(app).get('/api/records');

      expect(res.status).toBe(200);
      expect(res.body.meta.source).toBe('database');
    });

    it('should repopulate cache after database fallback', async () => {
      cacheService.getRecords.mockResolvedValueOnce(null);
      databaseService.getAllRecords.mockResolvedValueOnce(mockRecords);
      cacheService.setRecords.mockResolvedValueOnce();

      await request(app).get('/api/records');

      expect(cacheService.setRecords).toHaveBeenCalledWith(mockRecords);
    });

    it('should return empty array with count 0 when no records exist', async () => {
      cacheService.getRecords.mockResolvedValueOnce(null);
      databaseService.getAllRecords.mockResolvedValueOnce([]);
      cacheService.setRecords.mockResolvedValueOnce();

      const res = await request(app).get('/api/records');

      expect(res.status).toBe(200);
      expect(res.body.data.records).toEqual([]);
      expect(res.body.data.count).toBe(0);
    });
  });
});