const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

let pool = null;

/**
 * Creates and returns a singleton PostgreSQL connection pool.
 * Subsequent calls return the same pool instance.
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.connectionString,
      max: config.database.poolSize,
      // Close idle connections after 30 seconds
      idleTimeoutMillis: 30000,
      // Fail fast if connection can't be established in 5 seconds
      connectionTimeoutMillis: 5000,
    });

    // Log pool-level errors (e.g., unexpected disconnection)
    pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL pool error', { error: err.message });
    });

    // Log when a new client connects (useful for debugging pool behavior)
    pool.on('connect', () => {
      logger.debug('New client connected to PostgreSQL pool');
    });
  }

  return pool;
}

/**
 * Tests the database connection by running a simple query.
 * Used during startup health checks.
 */
async function testConnection() {
  const client = await getPool().connect();
  try {
    const result = await client.query('SELECT NOW() AS current_time');
    logger.info('✅ PostgreSQL connected', {
      time: result.rows[0].current_time,
      database: config.database.connectionString.split('/').pop().split('?')[0],
    });
  } finally {
    client.release();
  }
}

/**
 * Gracefully closes all pool connections.
 * Called during shutdown.
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('PostgreSQL pool closed');
  }
}

module.exports = {
  getPool,
  testConnection,
  closePool,
};