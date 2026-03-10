const logger = require('./logger');

/**
 * Retries an async function with exponential backoff.
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options
 * @param {string} options.serviceName - Name for logging
 * @param {number} options.maxRetries - Maximum attempts (default: 5)
 * @param {number} options.baseDelay - Initial delay in ms (default: 2000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 30000)
 * @returns {Promise<*>} Result of the successful function call
 */
async function connectWithRetry(fn, options = {}) {
  const {
    serviceName = 'Service',
    maxRetries = 5,
    baseDelay = 2000,
    maxDelay = 30000,
  } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      if (attempt === maxRetries) {
        logger.error(`❌ ${serviceName} connection failed after ${maxRetries} attempts`, {
          error: error.message,
        });
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);

      logger.warn(
        `⏳ ${serviceName} connection attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms`,
        { error: error.message }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

module.exports = { connectWithRetry };