const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const CACHE_KEY = 'csv-processor:records:all';

let redis = null;

/**
 * Creates and connects the Redis client.
 * Uses ioredis with automatic reconnection strategy.
 */
function connect() {
  redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 30000);
      logger.warn(`Redis reconnecting, attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    lazyConnect: false,
  });

  redis.on('connect', () => {
    logger.info('✅ Redis connected', {
      host: config.redis.host,
      port: config.redis.port,
    });
  });

  redis.on('error', (err) => {
    logger.error('Redis connection error', { error: err.message });
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redis;
}

/**
 * Retrieves all records from the Redis cache.
 *
 * CRITICAL: This function NEVER throws.
 * If Redis is down or the cache is empty, it returns null.
 * The controller uses null as the signal to fall back to the database.
 *
 * @returns {Object[]|null} Parsed records array, or null on miss/error
 */
async function getRecords() {
  try {
    if (!redis) {
      logger.warn('Redis client not initialized, skipping cache read');
      return null;
    }

    const data = await redis.get(CACHE_KEY);

    if (!data) {
      logger.debug('Cache miss', { key: CACHE_KEY });
      return null;
    }

    const records = JSON.parse(data);
    logger.debug('Cache hit', { key: CACHE_KEY, recordCount: records.length });
    return records;
  } catch (err) {
    // Redis is DOWN — log warning and return null (fallback to DB)
    // This is the FIRST try-catch: protects the read operation
    logger.warn('Redis unavailable for cache read, falling back to database', {
      error: err.message,
    });
    return null;
  }
}

/**
 * Sets all records in the Redis cache.
 *
 * CRITICAL: This function NEVER throws.
 * If Redis is down, it logs a warning and silently returns.
 * A failed cache write should never break a successful database read.
 *
 * @param {Object[]} records - Array of record objects to cache
 */
async function setRecords(records) {
  try {
    if (!redis) {
      logger.warn('Redis client not initialized, skipping cache write');
      return;
    }

    await redis.set(
      CACHE_KEY,
      JSON.stringify(records),
      'EX',
      config.redis.cacheTTL
    );

    logger.debug('Cache populated', {
      key: CACHE_KEY,
      recordCount: records.length,
      ttl: config.redis.cacheTTL,
    });
  } catch (err) {
    // Redis is DOWN — log warning and continue
    // This is the SECOND try-catch: protects the write operation
    logger.warn('Redis unavailable for cache write, skipping cache population', {
      error: err.message,
    });
  }
}

/**
 * Checks if the Redis client is connected and ready.
 * Used by the health endpoint.
 *
 * @returns {boolean}
 */
function isConnected() {
  return redis !== null && redis.status === 'ready';
}

/**
 * Returns the raw Redis client.
 * Used by the health endpoint for ping checks.
 */
function getClient() {
  return redis;
}

/**
 * Gracefully disconnects from Redis.
 */
async function disconnect() {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
}

module.exports = {
  connect,
  getRecords,
  setRecords,
  isConnected,
  getClient,
  disconnect,
  CACHE_KEY,
};