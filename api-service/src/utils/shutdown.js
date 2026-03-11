const logger = require('./logger');

/**
 * Sets up graceful shutdown handlers for SIGTERM and SIGINT.
 *
 * Executes cleanup steps in order, with a timeout safety net.
 * If cleanup takes longer than the timeout, the process is force-killed.
 *
 * @param {Object} options
 * @param {Array<{name: string, fn: Function}>} options.cleanupSteps - Ordered cleanup functions
 * @param {number} options.timeout - Maximum time for shutdown in ms (default: 15000)
 */
function setupGracefulShutdown({ cleanupSteps = [], timeout = 15000 } = {}) {
  let isShuttingDown = false;

  const shutdown = async (signal) => {
    // Prevent multiple shutdown calls (e.g., rapid Ctrl+C)
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal');
      return;
    }
    isShuttingDown = true;

    logger.info(`\n${signal} received. Starting graceful shutdown...`);

    // Safety net: force exit if cleanup hangs
    const forceExitTimer = setTimeout(() => {
      logger.error(`Shutdown timed out after ${timeout}ms — forcing exit`);
      process.exit(1);
    }, timeout);

    // Prevent the timer from keeping the process alive if shutdown completes
    forceExitTimer.unref();

    for (const step of cleanupSteps) {
      try {
        logger.info(`Shutting down: ${step.name}...`);
        await step.fn();
        logger.info(`✅ ${step.name} closed`);
      } catch (err) {
        // Log but continue — don't let one failed cleanup block the rest
        logger.error(`❌ Failed to close ${step.name}`, { error: err.message });
      }
    }

    clearTimeout(forceExitTimer);
    logger.info('✅ Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', {
      error: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception — shutting down', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
}

module.exports = { setupGracefulShutdown };