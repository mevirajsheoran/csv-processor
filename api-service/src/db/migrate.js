const fs = require('fs');
const path = require('path');
const { getPool } = require('./pool');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Runs all SQL migration files in the migrations directory.
 * Files are executed in alphabetical order (001_, 002_, etc.).
 * Each migration should be idempotent (use IF NOT EXISTS).
 */
async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // Read all .sql files sorted alphabetically
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      logger.warn('No migration files found');
      return;
    }

    await client.query('BEGIN');

    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      logger.info(`Running migration: ${file}`);
      await client.query(sql);
    }

    await client.query('COMMIT');
    logger.info('✅ All migrations completed successfully', {
      count: files.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('❌ Migration failed', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };