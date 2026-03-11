jest.mock('ioredis', () => {
  const mockInstance = {
    get: jest.fn(),
    set: jest.fn(),
    ping: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
    status: 'ready',
  };
  const MockRedis = jest.fn(() => mockInstance);
  MockRedis._instance = mockInstance;
  return MockRedis;
});

jest.mock('../../src/config', () => ({
  redis: {
    host: 'localhost',
    port: 6379,
    cacheTTL: 3600,
  },
  logging: { level: 'info' },
}));

const Redis = require('ioredis');
const cacheService = require('../../src/services/cache.service');

const mockRedis = Redis._instance;

describe('Cache Service', () => {
  beforeEach(() => {
    cacheService.connect();
  });

  describe('getRecords', () => {
    test('should return parsed data on cache hit', async () => {
      const records = [{ id: 1, sku: 'SKU001', price: 29.99 }];
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(records));

      const result = await cacheService.getRecords();

      expect(result).toEqual(records);
      expect(mockRedis.get).toHaveBeenCalledWith('csv-processor:records:all');
    });

    test('should return null on cache miss', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await cacheService.getRecords();

      expect(result).toBeNull();
    });

    test('should return null when Redis throws (not crash)', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await cacheService.getRecords();

      expect(result).toBeNull();
    });
  });

  describe('setRecords', () => {
    test('should call SET with correct key and TTL', async () => {
      const records = [{ id: 1, sku: 'SKU001' }];
      mockRedis.set.mockResolvedValueOnce('OK');

      await cacheService.setRecords(records);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'csv-processor:records:all',
        JSON.stringify(records),
        'EX',
        3600
      );
    });

    test('should silently fail when Redis throws (not crash)', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(cacheService.setRecords([{ id: 1 }])).resolves.toBeUndefined();
    });
  });

  describe('isConnected', () => {
    test('should return true when Redis status is ready', () => {
      mockRedis.status = 'ready';
      expect(cacheService.isConnected()).toBe(true);
    });

    test('should return false when Redis status is not ready', () => {
      mockRedis.status = 'reconnecting';
      const result = cacheService.isConnected();
      expect(result).toBe(false);
      mockRedis.status = 'ready';
    });
  });
});