jest.mock('../../src/services/deduplication.service', () => ({
  isDuplicate: jest.fn(),
}));

jest.mock('../../src/services/database.service', () => ({
  getAllRecords: jest.fn(),
  testConnection: jest.fn(),
  closePool: jest.fn(),
  getPool: jest.fn(),
}));

jest.mock('../../src/services/cache.service', () => ({
  connect: jest.fn(),
  setRecords: jest.fn(),
  getRecords: jest.fn(),
  getClient: jest.fn(() => ({ on: jest.fn(), ping: jest.fn() })),
  disconnect: jest.fn(),
  CACHE_KEY: 'csv-processor:records:all',
}));

const { handle } = require('../../src/handlers/records-uploaded.handler');
const deduplicationService = require('../../src/services/deduplication.service');
const databaseService = require('../../src/services/database.service');
const cacheService = require('../../src/services/cache.service');

describe('Records Uploaded Handler', () => {
  const mockEvent = {
    eventId: 'event-123',
    eventType: 'RECORDS_UPLOADED',
    timestamp: '2026-03-10T14:30:00.000Z',
    payload: {
      uploadId: 'upload-456',
      fileName: 'products.csv',
      recordCount: 5,
      inserted: 5,
      updated: 0,
    },
  };

  const mockRecords = [
    { id: 1, sku: 'SKU001', name: 'Widget', price: 29.99 },
    { id: 2, sku: 'SKU002', name: 'Gadget', price: 49.99 },
  ];

  test('should process valid event and refresh cache', async () => {
    deduplicationService.isDuplicate.mockResolvedValueOnce(false);
    databaseService.getAllRecords.mockResolvedValueOnce(mockRecords);
    cacheService.setRecords.mockResolvedValueOnce();

    await handle(mockEvent);

    expect(deduplicationService.isDuplicate).toHaveBeenCalledWith('event-123');
    expect(databaseService.getAllRecords).toHaveBeenCalledTimes(1);
    expect(cacheService.setRecords).toHaveBeenCalledWith(mockRecords);
  });

  test('should skip duplicate event without querying DB', async () => {
    deduplicationService.isDuplicate.mockResolvedValueOnce(true);

    await handle(mockEvent);

    expect(databaseService.getAllRecords).not.toHaveBeenCalled();
    expect(cacheService.setRecords).not.toHaveBeenCalled();
  });

  test('should throw when Redis is down for deduplication', async () => {
    deduplicationService.isDuplicate.mockRejectedValueOnce(
      new Error('ECONNREFUSED')
    );

    await expect(handle(mockEvent)).rejects.toThrow('ECONNREFUSED');
    expect(databaseService.getAllRecords).not.toHaveBeenCalled();
    expect(cacheService.setRecords).not.toHaveBeenCalled();
  });

  test('should throw when database query fails', async () => {
    deduplicationService.isDuplicate.mockResolvedValueOnce(false);
    databaseService.getAllRecords.mockRejectedValueOnce(
      new Error('Connection lost')
    );

    await expect(handle(mockEvent)).rejects.toThrow('Connection lost');
    expect(cacheService.setRecords).not.toHaveBeenCalled();
  });

  test('should throw when cache set fails', async () => {
    deduplicationService.isDuplicate.mockResolvedValueOnce(false);
    databaseService.getAllRecords.mockResolvedValueOnce(mockRecords);
    cacheService.setRecords.mockRejectedValueOnce(
      new Error('Redis write failed')
    );

    await expect(handle(mockEvent)).rejects.toThrow('Redis write failed');
  });
});