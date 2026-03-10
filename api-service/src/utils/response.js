/**
 * Standardized API response builder.
 * Every endpoint uses these functions to ensure consistent response shape.
 *
 * Success shape:
 * {
 *   "success": true,
 *   "message": "...",
 *   "data": { ... },
 *   "meta": { "timestamp": "...", ... }
 * }
 *
 * Error shape:
 * {
 *   "success": false,
 *   "error": {
 *     "code": "VALIDATION_ERROR",
 *     "message": "...",
 *     "details": [...]
 *   }
 * }
 */

function success(res, { message, data = {}, meta = {}, statusCode = 200 }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  });
}

function error(res, { statusCode = 500, code = 'INTERNAL_ERROR', message, details = [] }) {
  const body = {
    success: false,
    error: {
      code,
      message,
    },
  };

  // Only include details array if there are actual details
  if (details.length > 0) {
    body.error.details = details;
  }

  return res.status(statusCode).json(body);
}

module.exports = { success, error };