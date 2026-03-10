const { Readable } = require('stream');
const csvParser = require('csv-parser');
const logger = require('../utils/logger');
const { CsvParseError } = require('../utils/errors');

/**
 * Expected CSV headers. The CSV file must contain at least these columns.
 * Order doesn't matter — csv-parser matches by header name.
 */
const REQUIRED_HEADERS = ['sku', 'name', 'price', 'quantity'];
const VALID_HEADERS = ['sku', 'name', 'description', 'category', 'price', 'quantity'];

/**
 * Parses a CSV buffer into an array of record objects.
 * Uses stream-based parsing for memory efficiency.
 *
 * @param {Buffer} buffer - The raw CSV file buffer from multer
 * @returns {Promise<Object[]>} Array of parsed row objects
 * @throws {CsvParseError} If the buffer is empty, has no data rows, or has missing headers
 */
async function parse(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new CsvParseError('CSV file is empty');
  }

  return new Promise((resolve, reject) => {
    const records = [];
    let headers = null;

    const stream = Readable.from(buffer)
      .pipe(
        csvParser({
          mapHeaders: ({ header }) => header.trim().toLowerCase(),
          mapValues: ({ value }) => value.trim(),
          strict: false,
        })
      )
      .on('headers', (parsedHeaders) => {
        headers = parsedHeaders;

        // Check for required headers
        const missingHeaders = REQUIRED_HEADERS.filter(
          (required) => !parsedHeaders.includes(required)
        );

        if (missingHeaders.length > 0) {
          stream.destroy();
          reject(
            new CsvParseError(
              `CSV is missing required columns: ${missingHeaders.join(', ')}`,
              missingHeaders.map((h) => ({
                field: h,
                message: `Required column "${h}" is missing from CSV headers`,
              }))
            )
          );
        }
      })
      .on('data', (row) => {
        // Only pick valid headers — ignore extra columns
        const cleanRow = {};
        for (const header of VALID_HEADERS) {
          cleanRow[header] = row[header] !== undefined ? row[header] : '';
        }
        records.push(cleanRow);
      })
      .on('end', () => {
        if (records.length === 0) {
          reject(new CsvParseError('CSV file has headers but no data rows'));
          return;
        }

        logger.info('CSV parsed successfully', {
          rowCount: records.length,
          headers: headers,
        });

        resolve(records);
      })
      .on('error', (err) => {
        logger.error('CSV parsing stream error', { error: err.message });
        reject(new CsvParseError(`Failed to parse CSV: ${err.message}`));
      });
  });
}

module.exports = { parse, REQUIRED_HEADERS, VALID_HEADERS };