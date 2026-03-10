const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

const CACHE_KEY = 'csv-processor:records:all';

let redis = null;

/**
 * Creates and connects the Redis client.
 * Uses ioredis with automatic reconnection.
 */
function connect() {
  redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      // Exponential backoff: 500ms, 1s, 2s, 4s... up to 30s
      const delay = Math.min(times * 500, 30000);
      logger.warn(`Redis reconnecting, attempt ${times}, delay ${delay}ms`);
      return delay;
    },
    // Don't throw ECONNREFUSED on startup — let retry strategy handle it
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
 * Sets all records in the cache.
 * Called by the Kafka consumer after processing an upload event.
 *
 * @param {Object[]} records - Array of record objects from the database
 */
async function setRecords(records) {
  if (!redis) {
    throw new Error('Redis client not initialized');
  }

  await redis.set(
    CACHE_KEY,
    JSON.stringify(records),
    'EX',
    config.redis.cacheTTL
  );

  logger.info('Cache updated', {
    key: CACHE_KEY,
    recordCount: records.length,
    ttl: config.redis.cacheTTL,
  });
}

/**
 * Retrieves all records from the cache.
 *
 * @returns {Object[]|null} Parsed records array, or null if cache miss
 */
async function getRecords() {
  if (!redis) {
    return null;
  }

  const data = await redis.get(CACHE_KEY);

  if (!data) {
    return null;
  }

  return JSON.parse(data);
}

/**
 * Returns the Redis client instance.
 * Used for health checks and deduplication service.
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
  setRecords,
  getRecords,
  getClient,
  disconnect,
  CACHE_KEY,
};