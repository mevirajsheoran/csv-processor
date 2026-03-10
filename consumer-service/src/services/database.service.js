const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

let pool = null;

/**
 * Creates and returns a singleton PostgreSQL connection pool.
 * Consumer only reads from the database — never writes.
 */
function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.connectionString,
      max: config.database.poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL pool error', { error: err.message });
    });
  }

  return pool;
}

/**
 * Tests the database connection.
 */
async function testConnection() {
  const client = await getPool().connect();
  try {
    const result = await client.query('SELECT NOW() AS current_time');
    logger.info('✅ PostgreSQL connected', {
      time: result.rows[0].current_time,
    });
  } finally {
    client.release();
  }
}

/**
 * Retrieves all records from the database.
 * Used to refresh the Redis cache after a Kafka event.
 *
 * @returns {Promise<Object[]>} All records ordered by ID
 */
async function getAllRecords() {
  const result = await getPool().query(
    'SELECT id, sku, name, description, category, price, quantity, created_at, updated_at FROM records ORDER BY id ASC'
  );

  // Convert price from string (pg DECIMAL) to number
  const records = result.rows.map((row) => ({
    ...row,
    price: parseFloat(row.price),
  }));

  return records;
}

/**
 * Gracefully closes all pool connections.
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
  getAllRecords,
  closePool,
};