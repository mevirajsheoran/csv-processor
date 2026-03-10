const logger = require('../utils/logger');
const cacheService = require('./cache.service');

const DEDUP_KEY_PREFIX = 'processed';
const DEDUP_TTL = 86400; // 24 hours

/**
 * Checks if an event has already been processed.
 * Uses Redis SET NX EX for atomic check-and-set.
 *
 * SET key value EX ttl NX:
 * - NX = only set if key does NOT exist
 * - Returns 'OK' if key was set (new event)
 * - Returns null if key already existed (duplicate)
 *
 * @param {string} eventId - The unique event identifier
 * @returns {Promise<boolean>} true if duplicate (already processed), false if new
 * @throws {Error} If Redis is unavailable — caller must handle
 */
async function isDuplicate(eventId) {
  const redis = cacheService.getClient();

  if (!redis) {
    throw new Error('Redis client not available for deduplication');
  }

  const key = `${DEDUP_KEY_PREFIX}:${eventId}`;

  // SET NX returns 'OK' if key was set (new), null if it already existed (duplicate)
  const result = await redis.set(key, '1', 'EX', DEDUP_TTL, 'NX');

  if (result === null) {
    // Key already existed — this event was already processed
    logger.info('Duplicate event detected', { eventId, key });
    return true;
  }

  // Key was set — this is a new event
  return false;
}

module.exports = {
  isDuplicate,
  DEDUP_KEY_PREFIX,
  DEDUP_TTL,
};