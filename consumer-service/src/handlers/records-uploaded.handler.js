const databaseService = require('../services/database.service');
const cacheService = require('../services/cache.service');
const deduplicationService = require('../services/deduplication.service');
const logger = require('../utils/logger');

/**
 * Handles a RECORDS_UPLOADED event from Kafka.
 *
 * Flow:
 * 1. Check for duplicate event (idempotency)
 * 2. Query PostgreSQL for all current records
 * 3. Refresh Redis cache with the full record set
 *
 * If ANY step fails, the error propagates to the consumer,
 * which will NOT commit the offset — Kafka redelivers the message.
 *
 * @param {Object} event - Parsed Kafka event
 * @param {string} event.eventId - Unique event identifier
 * @param {string} event.eventType - Should be 'RECORDS_UPLOADED'
 * @param {string} event.timestamp - ISO 8601 timestamp
 * @param {Object} event.payload - Event payload
 */
async function handle(event) {
  const { eventId, payload } = event;

  logger.info('📨 Processing RECORDS_UPLOADED event', {
    eventId,
    uploadId: payload.uploadId,
    fileName: payload.fileName,
    recordCount: payload.recordCount,
  });

  // Step 1: Idempotency check — skip if already processed
  try {
    const duplicate = await deduplicationService.isDuplicate(eventId);
    if (duplicate) {
      logger.info('⏭️ Duplicate event skipped', { eventId });
      return;
    }
  } catch (redisError) {
    // Redis is down — can't deduplicate AND can't cache
    // Let the message fail and be redelivered when Redis is back
    logger.error('Redis unavailable for deduplication, cannot process event', {
      eventId,
      error: redisError.message,
    });
    throw redisError;
  }

  // Step 2: Query PostgreSQL for all current records
  // We query the DB instead of using the Kafka payload because:
  // - DB is the single source of truth
  // - Kafka messages stay small
  // - Handles concurrent uploads correctly (cache reflects final DB state)
  const records = await databaseService.getAllRecords();

  logger.info('🔄 Refreshing cache', {
    eventId,
    recordCount: records.length,
  });

  // Step 3: Update Redis cache with complete record set
  await cacheService.setRecords(records);

  logger.info('✅ Event processed successfully', {
    eventId,
    uploadId: payload.uploadId,
    cachedRecords: records.length,
  });
}

module.exports = { handle };