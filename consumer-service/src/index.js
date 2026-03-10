const config = require('./config');
const logger = require('./utils/logger');
const { connectWithRetry } = require('./utils/retry');
const { setupGracefulShutdown } = require('./utils/shutdown');
const databaseService = require('./services/database.service');
const cacheService = require('./services/cache.service');
const consumer = require('./consumer');

/**
 * Starts the Kafka consumer service.
 *
 * Startup sequence:
 * 1. Connect to PostgreSQL (with retry)
 * 2. Connect to Redis (with retry)
 * 3. Create and connect Kafka consumer (with retry)
 * 4. Start consuming messages
 * 5. Register shutdown handlers
 */
async function start() {
  try {
    logger.info('🚀 Starting CSV Processor Consumer...');

    // Step 1: Connect to PostgreSQL
    await connectWithRetry(
      () => databaseService.testConnection(),
      { serviceName: 'PostgreSQL', maxRetries: 5, baseDelay: 2000 }
    );

    // Step 2: Connect to Redis
    await connectWithRetry(
      () => {
        cacheService.connect();
        const client = cacheService.getClient();
        return client.ping();
      },
      { serviceName: 'Redis', maxRetries: 5, baseDelay: 2000 }
    );

    // Step 3: Create and connect Kafka consumer
    await connectWithRetry(
      () => consumer.createConsumer(),
      { serviceName: 'Kafka Consumer', maxRetries: 5, baseDelay: 3000 }
    );

    // Step 4: Start consuming messages
    await consumer.startConsuming();

    logger.info('✅ Consumer service is running');

    // Step 5: Register shutdown handlers (reverse order of startup)
    setupGracefulShutdown({
      cleanupSteps: [
        {
          name: 'Kafka Consumer',
          fn: () => consumer.disconnect(),
        },
        {
          name: 'Redis',
          fn: () => cacheService.disconnect(),
        },
        {
          name: 'PostgreSQL',
          fn: () => databaseService.closePool(),
        },
      ],
      timeout: 15000,
    });
  } catch (err) {
    logger.error('❌ Failed to start consumer service', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

// ─── Bootstrap ──────────────────────────────────────
start();

module.exports = { start };