const { validate } = require('../../src/validators/csv.validator');

describe('CSV Validator', () => {
  const validRecord = {
    sku: 'SKU001',
    name: 'Widget',
    description: 'A widget',
    category: 'Electronics',
    price: '29.99',
    quantity: '100',
  };

  describe('valid records', () => {
    it('should validate all-valid records with no errors', () => {
      const records = [
        { ...validRecord },
        { ...validRecord, sku: 'SKU002', name: 'Gadget' },
      ];

      const result = validate(records);

      expect(result.hasErrors).toBe(false);
      expect(result.errors).toHaveLength(0);
      expect(result.validatedRecords).toHaveLength(2);
    });

    it('should convert string price to number', () => {
      const result = validate([{ ...validRecord }]);

      expect(typeof result.validatedRecords[0].price).toBe('number');
      expect(result.validatedRecords[0].price).toBe(29.99);
    });

    it('should convert string quantity to number', () => {
      const result = validate([{ ...validRecord }]);

      expect(typeof result.validatedRecords[0].quantity).toBe('number');
      expect(result.validatedRecords[0].quantity).toBe(100);
    });

    it('should allow empty description and category', () => {
      const record = { ...validRecord, description: '', category: '' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(false);
      expect(result.validatedRecords).toHaveLength(1);
    });

    it('should allow price of zero', () => {
      const record = { ...validRecord, price: '0' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(false);
      expect(result.validatedRecords[0].price).toBe(0);
    });

    it('should allow quantity of zero', () => {
      const record = { ...validRecord, quantity: '0' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(false);
      expect(result.validatedRecords[0].quantity).toBe(0);
    });
  });

  describe('invalid records', () => {
    it('should detect empty SKU', () => {
      const record = { ...validRecord, sku: '' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].field).toBe('sku');
      expect(result.errors[0].row).toBe(2);
    });

    it('should detect empty name', () => {
      const record = { ...validRecord, name: '' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].field).toBe('name');
    });

    it('should detect non-numeric price', () => {
      const record = { ...validRecord, price: 'abc' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].field).toBe('price');
    });

    it('should detect negative price', () => {
      const record = { ...validRecord, price: '-5' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].field).toBe('price');
    });

    it('should detect non-integer quantity', () => {
      const record = { ...validRecord, quantity: '5.5' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].field).toBe('quantity');
    });

    it('should detect negative quantity', () => {
      const record = { ...validRecord, quantity: '-1' };
      const result = validate([record]);

      expect(result.hasErrors).toBe(true);
      expect(result.errors[0].field).toBe('quantity');
    });

    it('should collect ALL errors across ALL rows', () => {
      const records = [
        { ...validRecord, sku: '', name: '' },
        { ...validRecord, sku: 'SKU002', price: 'abc', quantity: '-1' },
      ];

      const result = validate(records);

      expect(result.hasErrors).toBe(true);
      // Row 1: sku + name = 2 errors, Row 2: price + quantity = 2 errors
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
      expect(result.validatedRecords).toHaveLength(0);
    });

    it('should use correct row numbers (1-indexed + header offset)', () => {
      const records = [
        { ...validRecord },
        { ...validRecord, sku: 'SKU002', price: 'bad' },
      ];

      const result = validate(records);

      // Second record is row 3 (index 1 + 2 for header offset)
      const priceError = result.errors.find((e) => e.field === 'price');
      expect(priceError.row).toBe(3);
    });
  });

  describe('duplicate SKU detection', () => {
    it('should detect duplicate SKUs and return warnings', () => {
      const records = [
        { ...validRecord, sku: 'SKU001', name: 'First' },
        { ...validRecord, sku: 'SKU002', name: 'Unique' },
        { ...validRecord, sku: 'SKU001', name: 'Second' },
      ];

      const result = validate(records);

      expect(result.hasErrors).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('DUPLICATE_SKU');
      expect(result.warnings[0].sku).toBe('SKU001');
    });

    it('should use last occurrence for duplicate SKUs', () => {
      const records = [
        { ...validRecord, sku: 'SKU001', name: 'First' },
        { ...validRecord, sku: 'SKU001', name: 'Second' },
      ];

      const result = validate(records);

      expect(result.validatedRecords).toHaveLength(1);
      expect(result.validatedRecords[0].name).toBe('Second');
    });

    it('should return correct count after deduplication', () => {
      const records = [
        { ...validRecord, sku: 'SKU001' },
        { ...validRecord, sku: 'SKU002' },
        { ...validRecord, sku: 'SKU001' },
      ];

      const result = validate(records);

      expect(result.validatedRecords).toHaveLength(2);
    });
  });
});