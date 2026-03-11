jest.mock('../../src/services/cache.service', () => {
  const mockRedis = {
    set: jest.fn(),
    on: jest.fn(),
    status: 'ready',
  };
  return {
    getClient: jest.fn(() => mockRedis),
    connect: jest.fn(),
    disconnect: jest.fn(),
    setRecords: jest.fn(),
    getRecords: jest.fn(),
    CACHE_KEY: 'csv-processor:records:all',
    _mockRedis: mockRedis,
  };
});

const cacheService = require('../../src/services/cache.service');
const { isDuplicate } = require('../../src/services/deduplication.service');

const mockRedis = cacheService._mockRedis;

describe('Deduplication Service', () => {
  describe('isDuplicate', () => {
    test('should return false for new event (SET NX returns OK)', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      const result = await isDuplicate('event-123');

      expect(result).toBe(false);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'processed:event-123',
        '1',
        'EX',
        86400,
        'NX'
      );
    });

    test('should return true for duplicate event (SET NX returns null)', async () => {
      mockRedis.set.mockResolvedValueOnce(null);

      const result = await isDuplicate('event-123');

      expect(result).toBe(true);
    });

    test('should throw when Redis is unavailable', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(isDuplicate('event-123')).rejects.toThrow('ECONNREFUSED');
    });

    test('should use correct key prefix and TTL', async () => {
      mockRedis.set.mockResolvedValueOnce('OK');

      await isDuplicate('abc-def-ghi');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'processed:abc-def-ghi',
        '1',
        'EX',
        86400,
        'NX'
      );
    });
  });
});