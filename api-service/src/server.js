const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { testConnection, closePool } = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { connectWithRetry } = require('./utils/retry');
const { setupGracefulShutdown } = require('./utils/shutdown');
const kafkaProducer = require('./services/kafka.producer');
const cacheService = require('./services/cache.service');

let server = null;

/**
 * Starts the API server.
 *
 * Startup sequence:
 * 1. Connect to PostgreSQL (with retry)
 * 2. Run database migrations
 * 3. Connect Kafka producer (with retry)
 * 4. Connect to Redis (with retry)
 * 5. Start HTTP server
 * 6. Register shutdown handlers
 */
async function start() {
  try {
    logger.info('🚀 Starting CSV Processor API...');

    // Step 1: Connect to PostgreSQL
    await connectWithRetry(
      () => testConnection(),
      { serviceName: 'PostgreSQL', maxRetries: 5, baseDelay: 2000 }
    );

    // Step 2: Run database migrations
    await runMigrations();

    // Step 3: Connect Kafka producer
    await connectWithRetry(
      () => kafkaProducer.connect(),
      { serviceName: 'Kafka Producer', maxRetries: 5, baseDelay: 3000 }
    );

    // Step 4: Connect to Redis
    await connectWithRetry(
      () => {
        cacheService.connect();
        const client = cacheService.getClient();
        return client.ping();
      },
      { serviceName: 'Redis', maxRetries: 5, baseDelay: 2000 }
    );

    // Step 5: Start HTTP server
    server = app.listen(config.port, () => {
      logger.info(`✅ API server running on port ${config.port}`);
    });

    // Step 6: Register shutdown handlers (reverse order of startup)
    setupGracefulShutdown({
      cleanupSteps: [
        {
          name: 'HTTP Server',
          fn: () => new Promise((resolve, reject) => {
            if (!server) {
              return resolve();
            }
            server.close((err) => {
              if (err) {
                return reject(err);
              }
              resolve();
            });
          }),
        },
        {
          name: 'Redis',
          fn: () => cacheService.disconnect(),
        },
        {
          name: 'Kafka Producer',
          fn: () => kafkaProducer.disconnect(),
        },
        {
          name: 'PostgreSQL',
          fn: () => closePool(),
        },
      ],
      timeout: 15000,
    });
  } catch (err) {
    logger.error('❌ Failed to start API server', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

// ─── Bootstrap ──────────────────────────────────────
start();

module.exports = { start, server };