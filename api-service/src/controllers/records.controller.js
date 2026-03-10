const cacheService = require('../services/cache.service');
const databaseService = require('../services/database.service');
const logger = require('../utils/logger');
const response = require('../utils/response');

/**
 * GET /api/records
 *
 * Retrieves all records using cache-aside pattern:
 * 1. Try Redis cache → return if hit
 * 2. Cache miss or Redis down → query PostgreSQL
 * 3. Repopulate cache for next request (non-blocking on failure)
 * 4. Return records with source indicator
 */
async function getRecords(req, res, next) {
  try {
    let source = 'cache';
    let records = null;

    // Step 1: Try Redis cache
    records = await cacheService.getRecords();

    // Step 2: Cache miss or Redis down → fall back to database
    if (records === null) {
      source = 'database';

      logger.info('Fetching records from database (cache miss or unavailable)');
      records = await databaseService.getAllRecords();

      // Step 3: Try to repopulate cache for subsequent requests
      // cacheService.setRecords never throws — safe to call without try-catch
      await cacheService.setRecords(records);
    }

    // Step 4: Return response with source indicator
    return response.success(res, {
      message: 'Records retrieved successfully',
      data: {
        records,
        count: records.length,
      },
      meta: {
        source,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getRecords };