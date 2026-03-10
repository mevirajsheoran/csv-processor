const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Joi schema for a single CSV row.
 * Validates types, ranges, and required fields.
 */
const rowSchema = Joi.object({
  sku: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .required()
    .messages({
      'string.empty': 'SKU is required',
      'string.max': 'SKU must be 50 characters or less',
      'any.required': 'SKU is required',
    }),

  name: Joi.string()
    .trim()
    .min(1)
    .max(255)
    .required()
    .messages({
      'string.empty': 'Name is required',
      'string.max': 'Name must be 255 characters or less',
      'any.required': 'Name is required',
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .allow('')
    .default('')
    .messages({
      'string.max': 'Description must be 1000 characters or less',
    }),

  category: Joi.string()
    .trim()
    .max(100)
    .allow('')
    .default('')
    .messages({
      'string.max': 'Category must be 100 characters or less',
    }),

  price: Joi.number()
    .precision(2)
    .min(0)
    .required()
    .messages({
      'number.base': 'Price must be a valid number',
      'number.min': 'Price must be a non-negative number',
      'any.required': 'Price is required',
    }),

  quantity: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.base': 'Quantity must be a valid integer',
      'number.integer': 'Quantity must be a whole number',
      'number.min': 'Quantity must be a non-negative integer',
      'any.required': 'Quantity is required',
    }),
});

/**
 * Validates all parsed CSV records.
 * Collects ALL errors across ALL rows before rejecting.
 * Also detects duplicate SKUs within the same file.
 *
 * @param {Object[]} records - Array of parsed row objects from csv.service
 * @returns {{ validatedRecords: Object[], errors: Object[], warnings: Object[] }}
 */
function validate(records) {
  const errors = [];
  const warnings = [];
  const validatedRecords = [];
  const skuMap = new Map(); // Track SKU occurrences for duplicate detection

  for (let i = 0; i < records.length; i++) {
    // Row number is i + 2 (1-indexed + header row)
    const rowNumber = i + 2;
    const record = records[i];

    // Validate row against Joi schema
    const { error: validationError, value: validatedRow } = rowSchema.validate(
      record,
      {
        abortEarly: false, // Collect ALL errors in this row, not just the first
        convert: true, // Convert "29.99" string to 29.99 number
        stripUnknown: true, // Remove any fields not in the schema
      }
    );

    if (validationError) {
      // Map Joi error details to our error format
      const rowErrors = validationError.details.map((detail) => ({
        row: rowNumber,
        field: detail.path[0],
        message: detail.message,
        value: record[detail.path[0]],
      }));
      errors.push(...rowErrors);
      continue; // Don't add invalid rows to validated set
    }

    // Track duplicate SKUs within the same file
    const sku = validatedRow.sku;
    if (skuMap.has(sku)) {
      const firstOccurrence = skuMap.get(sku);
      warnings.push({
        type: 'DUPLICATE_SKU',
        sku,
        rows: [firstOccurrence, rowNumber],
        resolution: 'Last occurrence will be used',
      });

      // Replace the earlier occurrence with the later one
      const existingIndex = validatedRecords.findIndex((r) => r.sku === sku);
      if (existingIndex !== -1) {
        validatedRecords[existingIndex] = validatedRow;
      }
    } else {
      validatedRecords.push(validatedRow);
    }

    skuMap.set(sku, rowNumber);
  }

  if (errors.length > 0) {
    // Count unique rows with errors
    const errorRows = new Set(errors.map((e) => e.row));
    logger.warn('CSV validation failed', {
      totalErrors: errors.length,
      rowsWithErrors: errorRows.size,
      totalRows: records.length,
    });
  }

  if (warnings.length > 0) {
    logger.warn('CSV validation warnings', {
      warnings: warnings.length,
    });
  }

  return {
    validatedRecords,
    errors,
    warnings,
    hasErrors: errors.length > 0,
  };
}

module.exports = { validate, rowSchema };