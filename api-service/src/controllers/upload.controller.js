const { v4: uuidv4 } = require('uuid');
const csvService = require('../services/csv.service');
const csvValidator = require('../validators/csv.validator');
const databaseService = require('../services/database.service');
const kafkaProducer = require('../services/kafka.producer');
const logger = require('../utils/logger');
const response = require('../utils/response');
const { ValidationError } = require('../utils/errors');

/**
 * POST /api/upload
 *
 * Handles CSV file upload:
 * 1. Validate file presence
 * 2. Parse CSV buffer into records
 * 3. Validate all records (reject if any errors)
 * 4. Bulk upsert into PostgreSQL
 * 5. Publish event to Kafka
 * 6. Return structured result with insert/update counts
 */
async function uploadCsv(req, res, next) {
  const uploadId = uuidv4();
  const eventId = uuidv4();

  try {
    // Step 1: Check that a file was provided
    if (!req.file) {
      throw new ValidationError('No file uploaded. Please attach a CSV file.', [
        {
          field: 'file',
          message: 'A CSV file is required. Use form field name "file".',
        },
      ]);
    }

    const fileName = req.file.originalname;
    logger.info('CSV upload started', { uploadId, fileName, size: req.file.size });

    // Step 2: Parse CSV buffer into array of row objects
    const parsedRecords = await csvService.parse(req.file.buffer);

    // Step 3: Validate all rows
    const { validatedRecords, errors, warnings, hasErrors } = csvValidator.validate(parsedRecords);

    if (hasErrors) {
      const errorRows = new Set(errors.map((e) => e.row));
      throw new ValidationError(
        `CSV validation failed: ${errors.length} error(s) in ${errorRows.size} row(s)`,
        errors
      );
    }

    // Step 4: Bulk upsert validated records into PostgreSQL
    const dbResult = await databaseService.bulkUpsert(validatedRecords);

    // Step 5: Publish event to Kafka (non-blocking — upload succeeds even if Kafka fails)
    const kafkaPublished = await kafkaProducer.publishUploadEvent({
      eventId,
      uploadId,
      fileName,
      recordCount: dbResult.total,
      inserted: dbResult.inserted,
      updated: dbResult.updated,
    });

    logger.info('CSV upload completed', {
      uploadId,
      fileName,
      ...dbResult,
      kafkaPublished,
    });

    // Step 6: Return success response
    return response.success(res, {
      statusCode: 200,
      message: 'CSV file processed successfully',
      data: {
        uploadId,
        fileName,
        totalRecords: dbResult.total,
        inserted: dbResult.inserted,
        updated: dbResult.updated,
        kafkaPublished,
      },
      meta: {
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadCsv };