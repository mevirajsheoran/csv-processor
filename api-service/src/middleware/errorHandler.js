const logger = require('../utils/logger');
const { AppError } = require('../utils/errors');
const response = require('../utils/response');

/**
 * Global Express error handler.
 * Must have 4 parameters (err, req, res, next) for Express to recognize it as an error handler.
 *
 * Handles:
 * - Our custom AppError subclasses → structured error response with appropriate status code
 * - Multer errors → 400 with file-specific message
 * - Unknown errors → 500 with generic message (never expose internals)
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Log every error with context
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: err.message,
    code: err.code,
    stack: err.stack,
  });

  // Our custom operational errors — safe to expose message to client
  if (err instanceof AppError) {
    return response.error(res, {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details || [],
    });
  }

  // Multer-specific errors (file too large, too many files, etc.)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return response.error(res, {
      statusCode: 400,
      code: 'FILE_TOO_LARGE',
      message: 'File size exceeds the 5MB limit',
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return response.error(res, {
      statusCode: 400,
      code: 'TOO_MANY_FILES',
      message: 'Only one file can be uploaded at a time',
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return response.error(res, {
      statusCode: 400,
      code: 'UNEXPECTED_FIELD',
      message: 'Unexpected file field name. Use "file" as the field name.',
    });
  }

  // Unknown/unexpected errors — never expose internals to client
  return response.error(res, {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  });
}

module.exports = errorHandler;