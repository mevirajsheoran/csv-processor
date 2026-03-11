jest.mock('../../src/db/pool');

const { getPool } = require('../../src/db/pool');
const { bulkUpsert, getAllRecords, buildBulkUpsertQuery } = require('../../src/services/database.service');

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  connect: jest.fn(),
  query: jest.fn(),
};

describe('Database Service', () => {
  beforeEach(() => {
    getPool.mockReturnValue(mockPool);
    mockPool.connect.mockResolvedValue(mockClient);
  });

  describe('buildBulkUpsertQuery', () => {
    test('should generate correct parameterized SQL for single record', () => {
      const records = [
        { sku: 'SKU001', name: 'Widget', description: 'Desc', category: 'Cat', price: 29.99, quantity: 100 },
      ];

      const { query, params } = buildBulkUpsertQuery(records);

      expect(query).toContain('INSERT INTO records');
      expect(query).toContain('ON CONFLICT (sku) DO UPDATE');
      expect(query).toContain('$1');
      expect(query).toContain('$6');
      expect(query).not.toContain('$7');
      expect(params).toEqual(['SKU001', 'Widget', 'Desc', 'Cat', 29.99, 100]);
    });

    test('should generate correct parameterized SQL for multiple records', () => {
      const records = [
        { sku: 'SKU001', name: 'Widget', description: 'D1', category: 'C1', price: 10, quantity: 5 },
        { sku: 'SKU002', name: 'Gadget', description: 'D2', category: 'C2', price: 20, quantity: 10 },
      ];

      const { query, params } = buildBulkUpsertQuery(records);

      expect(query).toContain('$1');
      expect(query).toContain('$12');
      expect(query).not.toContain('$13');
      expect(params).toHaveLength(12);
    });
  });

  describe('bulkUpsert', () => {
    test('should execute BEGIN, query, and COMMIT on the same client', async () => {
      const records = [
        { sku: 'SKU001', name: 'Widget', description: 'D', category: 'C', price: 10, quantity: 5 },
      ];

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1, sku: 'SKU001', is_new: true }] }) // INSERT
        .mockResolvedValueOnce(); // COMMIT

      const result = await bulkUpsert(records);

      expect(mockPool.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledTimes(3);
      expect(mockClient.query.mock.calls[0][0]).toBe('BEGIN');
      expect(mockClient.query.mock.calls[2][0]).toBe('COMMIT');
      expect(result).toEqual({ inserted: 1, updated: 0, total: 1 });
    });

    test('should call ROLLBACK on query failure', async () => {
      const records = [
        { sku: 'SKU001', name: 'Widget', description: 'D', category: 'C', price: 10, quantity: 5 },
      ];

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(new Error('DB error')) // INSERT fails
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(bulkUpsert(records)).rejects.toThrow('Failed to upsert records');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('should always release client even on error', async () => {
      const records = [
        { sku: 'SKU001', name: 'Widget', description: 'D', category: 'C', price: 10, quantity: 5 },
      ];

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockRejectedValueOnce(new Error('DB error')) // INSERT fails
        .mockResolvedValueOnce(); // ROLLBACK

      await expect(bulkUpsert(records)).rejects.toThrow();
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    test('should correctly count inserts vs updates from xmax', async () => {
      const records = [
        { sku: 'SKU001', name: 'W1', description: 'D', category: 'C', price: 10, quantity: 5 },
        { sku: 'SKU002', name: 'W2', description: 'D', category: 'C', price: 20, quantity: 10 },
        { sku: 'SKU003', name: 'W3', description: 'D', category: 'C', price: 30, quantity: 15 },
      ];

      mockClient.query
        .mockResolvedValueOnce() // BEGIN
        .mockResolvedValueOnce({
          rows: [
            { id: 1, sku: 'SKU001', is_new: true },
            { id: 2, sku: 'SKU002', is_new: false },
            { id: 3, sku: 'SKU003', is_new: true },
          ],
        }) // INSERT
        .mockResolvedValueOnce(); // COMMIT

      const result = await bulkUpsert(records);

      expect(result).toEqual({ inserted: 2, updated: 1, total: 3 });
    });
  });

  describe('getAllRecords', () => {
    test('should return parsed records with float prices', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, sku: 'SKU001', name: 'Widget', price: '29.99', quantity: 100 },
          { id: 2, sku: 'SKU002', name: 'Gadget', price: '49.99', quantity: 50 },
        ],
      });

      const records = await getAllRecords();

      expect(records).toHaveLength(2);
      expect(typeof records[0].price).toBe('number');
      expect(records[0].price).toBe(29.99);
    });

    test('should throw DatabaseError on query failure', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection lost'));

      await expect(getAllRecords()).rejects.toThrow('Failed to fetch records');
    });
  });
});