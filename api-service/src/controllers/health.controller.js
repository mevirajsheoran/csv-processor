const { getPool } = require('../db/pool');
const cacheService = require('../services/cache.service');
const kafkaProducer = require('../services/kafka.producer');
const logger = require('../utils/logger');

// Track when the server started for uptime calculation
const startTime = Date.now();

/**
 * Formats milliseconds into a human-readable uptime string.
 *
 * @param {number} ms - Milliseconds since server start
 * @returns {string} e.g., "2h 15m 30s"
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes % 60 > 0) {
    parts.push(`${minutes % 60}m`);
  }
  parts.push(`${seconds % 60}s`);

  return parts.join(' ');
}

/**
 * Checks PostgreSQL connectivity by running a lightweight query.
 *
 * @returns {Promise<string>} "connected" or "disconnected"
 */
async function checkPostgres() {
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return 'connected';
    } finally {
      client.release();
    }
  } catch (err) {
    logger.warn('Health check: PostgreSQL is down', { error: err.message });
    return 'disconnected';
  }
}

/**
 * Checks Redis connectivity by sending a PING command.
 *
 * @returns {Promise<string>} "connected" or "disconnected"
 */
async function checkRedis() {
  try {
    if (!cacheService.isConnected()) {
      return 'disconnected';
    }

    const client = cacheService.getClient();
    const result = await client.ping();
    return result === 'PONG' ? 'connected' : 'disconnected';
  } catch (err) {
    logger.warn('Health check: Redis is down', { error: err.message });
    return 'disconnected';
  }
}

/**
 * Checks Kafka producer connectivity.
 *
 * @returns {string} "connected" or "disconnected"
 */
function checkKafka() {
  return kafkaProducer.isConnected() ? 'connected' : 'disconnected';
}

/**
 * GET /api/health
 *
 * Returns the health status of all dependent services.
 * - 200 if all services are healthy
 * - 503 if any service is degraded
 */
async function getHealth(_req, res) {
  const [postgresStatus, redisStatus] = await Promise.all([
    checkPostgres(),
    checkRedis(),
  ]);

  const kafkaStatus = checkKafka();

  const services = {
    postgresql: postgresStatus,
    redis: redisStatus,
    kafka: kafkaStatus,
  };

  const allHealthy = Object.values(services).every((s) => s === 'connected');
  const status = allHealthy ? 'healthy' : 'degraded';
  const httpStatus = allHealthy ? 200 : 503;

  const uptime = formatUptime(Date.now() - startTime);

  logger.debug('Health check completed', { status, services, uptime });

  return res.status(httpStatus).json({
    status,
    services,
    uptime,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { getHealth };