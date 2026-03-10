/**
 * Base application error.
 * All custom errors extend this so the error handler can distinguish
 * our errors from unexpected system errors.
 */
class AppError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    // Capture stack trace without this constructor in it
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 — Thrown when request input fails validation.
 * Supports an optional `details` array for field-level errors.
 */
class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * 400 — Thrown when CSV parsing fails (malformed file, wrong encoding, etc.)
 */
class CsvParseError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'CSV_PARSE_ERROR');
    this.details = details;
  }
}

/**
 * 500 — Thrown when a database operation fails unexpectedly.
 */
class DatabaseError extends AppError {
  constructor(message) {
    super(message, 500, 'DATABASE_ERROR');
  }
}

/**
 * 500 — Thrown when Kafka publishing fails.
 * Non-critical: the upload still succeeded, but the event wasn't published.
 */
class KafkaError extends AppError {
  constructor(message) {
    super(message, 500, 'KAFKA_ERROR');
  }
}

module.exports = {
  AppError,
  ValidationError,
  CsvParseError,
  DatabaseError,
  KafkaError,
};