const csvService = require('../../src/services/csv.service');
const { CsvParseError } = require('../../src/utils/errors');

describe('CSV Service', () => {
  describe('parse', () => {
    it('should parse a valid CSV buffer with all columns', async () => {
      const csv = [
        'sku,name,description,category,price,quantity',
        'SKU001,Widget,A widget,Electronics,29.99,100',
        'SKU002,Gadget,A gadget,Tools,49.99,50',
      ].join('\n');

      const records = await csvService.parse(Buffer.from(csv));

      expect(records).toHaveLength(2);
      expect(records[0]).toEqual({
        sku: 'SKU001',
        name: 'Widget',
        description: 'A widget',
        category: 'Electronics',
        price: '29.99',
        quantity: '100',
      });
      expect(records[1]).toEqual({
        sku: 'SKU002',
        name: 'Gadget',
        description: 'A gadget',
        category: 'Tools',
        price: '49.99',
        quantity: '50',
      });
    });

    it('should parse CSV with only required columns and default optional ones', async () => {
      const csv = [
        'sku,name,price,quantity',
        'SKU001,Widget,29.99,100',
      ].join('\n');

      const records = await csvService.parse(Buffer.from(csv));

      expect(records).toHaveLength(1);
      expect(records[0].description).toBe('');
      expect(records[0].category).toBe('');
    });

    it('should handle headers with extra whitespace and mixed case', async () => {
      const csv = [
        ' SKU , Name , Price , Quantity ',
        'SKU001,Widget,29.99,100',
      ].join('\n');

      const records = await csvService.parse(Buffer.from(csv));

      expect(records).toHaveLength(1);
      expect(records[0].sku).toBe('SKU001');
      expect(records[0].name).toBe('Widget');
    });

    it('should ignore extra columns not in VALID_HEADERS', async () => {
      const csv = [
        'sku,name,price,quantity,notes,extra',
        'SKU001,Widget,29.99,100,some note,extra data',
      ].join('\n');

      const records = await csvService.parse(Buffer.from(csv));

      expect(records).toHaveLength(1);
      expect(records[0]).not.toHaveProperty('notes');
      expect(records[0]).not.toHaveProperty('extra');
    });

    it('should throw CsvParseError for empty buffer', async () => {
      await expect(csvService.parse(Buffer.from('')))
        .rejects
        .toThrow(CsvParseError);
    });

    it('should throw CsvParseError for null buffer', async () => {
      await expect(csvService.parse(null))
        .rejects
        .toThrow(CsvParseError);
    });

    it('should throw CsvParseError for undefined buffer', async () => {
      await expect(csvService.parse(undefined))
        .rejects
        .toThrow(CsvParseError);
    });

    it('should throw CsvParseError for CSV with headers but no data rows', async () => {
      const csv = 'sku,name,price,quantity\n';

      await expect(csvService.parse(Buffer.from(csv)))
        .rejects
        .toThrow(CsvParseError);
    });

    it('should throw CsvParseError when required headers are missing', async () => {
      const csv = [
        'sku,name',
        'SKU001,Widget',
      ].join('\n');

      await expect(csvService.parse(Buffer.from(csv)))
        .rejects
        .toThrow(CsvParseError);
    });

    it('should trim whitespace from cell values', async () => {
      const csv = [
        'sku,name,price,quantity',
        '  SKU001  ,  Widget  ,  29.99  ,  100  ',
      ].join('\n');

      const records = await csvService.parse(Buffer.from(csv));

      expect(records[0].sku).toBe('SKU001');
      expect(records[0].name).toBe('Widget');
      expect(records[0].price).toBe('29.99');
      expect(records[0].quantity).toBe('100');
    });
  });
});