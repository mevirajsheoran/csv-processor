const { getPool } = require('../db/pool');
const logger = require('../utils/logger');
const { DatabaseError } = require('../utils/errors');

/**
 * Builds a single bulk upsert query for all records.
 * Uses PostgreSQL's ON CONFLICT DO UPDATE for idempotent writes.
 *
 * @param {Object[]} records - Validated record objects
 * @returns {{ query: string, params: any[] }}
 */
function buildBulkUpsertQuery(records) {
  const values = [];
  const params = [];
  let paramIndex = 1;

  for (const record of records) {
    values.push(
      `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
    );
    params.push(
      record.sku,
      record.name,
      record.description,
      record.category,
      record.price,
      record.quantity
    );
  }

  const query = `
    INSERT INTO records (sku, name, description, category, price, quantity)
    VALUES ${values.join(', ')}
    ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      price = EXCLUDED.price,
      quantity = EXCLUDED.quantity,
      updated_at = NOW()
    RETURNING id, sku, (xmax = 0) AS is_new;
  `;

  return { query, params };
}

/**
 * Upserts all records in a single transaction using a dedicated client.
 *
 * Critical: Uses pool.connect() to get a single client for the entire transaction.
 * pool.query() would grab ANY available connection per call, breaking transaction isolation.
 *
 * @param {Object[]} records - Validated record objects
 * @returns {Promise<{ inserted: number, updated: number, total: number }>}
 * @throws {DatabaseError} If the transaction fails
 */
async function bulkUpsert(records) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { query, params } = buildBulkUpsertQuery(records);
    const result = await client.query(query, params);

    await client.query('COMMIT');

    // Count inserts vs updates using xmax system column
    // xmax = 0 means the row was freshly inserted (no previous version)
    // xmax > 0 means the row was updated (had a previous version)
    const inserted = result.rows.filter((row) => row.is_new === true).length;
    const updated = result.rows.filter((row) => row.is_new === false).length;

    logger.info('Bulk upsert completed', {
      inserted,
      updated,
      total: result.rows.length,
    });

    return { inserted, updated, total: result.rows.length };
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      // Log rollback failure but throw the original error
      logger.error('Transaction rollback failed', { error: rollbackErr.message });
    });

    logger.error('Bulk upsert failed', {
      error: err.message,
      recordCount: records.length,
    });

    throw new DatabaseError(`Failed to upsert records: ${err.message}`);
  } finally {
    // ALWAYS release the client back to the pool
    // Without this, the pool runs out of connections under load
    client.release();
  }
}

/**
 * Retrieves all records from the database, ordered by ID.
 * Used by both the Fetch API (cache miss) and the Kafka consumer (cache refresh).
 *
 * @returns {Promise<Object[]>} Array of all record objects
 * @throws {DatabaseError} If the query fails
 */
async function getAllRecords() {
  const pool = getPool();

  try {
    const result = await pool.query(
      'SELECT id, sku, name, description, category, price, quantity, created_at, updated_at FROM records ORDER BY id ASC'
    );

    // Convert price from string (pg returns DECIMAL as string) to number
    const records = result.rows.map((row) => ({
      ...row,
      price: parseFloat(row.price),
    }));

    return records;
  } catch (err) {
    logger.error('Failed to fetch records', { error: err.message });
    throw new DatabaseError(`Failed to fetch records: ${err.message}`);
  }
}

module.exports = {
  bulkUpsert,
  getAllRecords,
  buildBulkUpsertQuery, // Exported for testing
};