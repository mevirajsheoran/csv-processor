const mockRedis = {
  set: jest.fn(),
  on: jest.fn(),
  status: 'ready',
};

jest.mock('../../src/services/cache.service', () => ({
  getClient: jest.fn(() => mockRedis),
  connect: jest.fn(),
}));

const { isDuplicate } = require('../../src/services/deduplication.service');

describe('Deduplication Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isDuplicate', () => {
    it('should return false for new event (SET NX returns OK)', async () => {
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

    it('should return true for duplicate event (SET NX returns null)', async () => {
      mockRedis.set.mockResolvedValueOnce(null);

      const result = await isDuplicate('event-123');

      expect(result).toBe(true);
    });

    it('should throw when Redis is unavailable', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(isDuplicate('event-123')).rejects.toThrow('ECONNREFUSED');
    });

    it('should use correct key prefix and TTL', async () => {
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