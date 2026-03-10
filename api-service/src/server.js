const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { testConnection, closePool } = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { connectWithRetry } = require('./utils/retry');
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
  } catch (err) {
    logger.error('❌ Failed to start API server', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler.
 * Closes connections in reverse order of creation:
 * HTTP server → Redis → Kafka → Database
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    logger.info(`\n${signal} received. Starting graceful shutdown...`);

    // 1. Stop accepting new HTTP requests
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed');
          resolve();
        });
      });
    }

    // 2. Disconnect Redis
    await cacheService.disconnect();

    // 3. Disconnect Kafka producer
    await kafkaProducer.disconnect();

    // 4. Close database pool
    await closePool();

    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { error: reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception — shutting down', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
}

// ─── Bootstrap ──────────────────────────────────────
setupGracefulShutdown();
start();

module.exports = { start, server };