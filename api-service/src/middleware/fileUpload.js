const multer = require('multer');
const { ValidationError } = require('../utils/errors');

/**
 * Multer configuration for CSV file uploads.
 *
 * - memoryStorage: file stays in memory as a Buffer (no disk write needed)
 * - 5MB limit: prevents abuse without being too restrictive
 * - Single file only: one CSV per request
 * - File type filter: rejects non-CSV files before processing
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    // Check both MIME type and file extension
    // Some systems report CSV as text/plain or application/vnd.ms-excel
    const allowedMimeTypes = [
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
    ];

    const isValidMime = allowedMimeTypes.includes(file.mimetype);
    const isValidExtension = file.originalname.toLowerCase().endsWith('.csv');

    if (!isValidMime && !isValidExtension) {
      cb(new ValidationError('Only CSV files are allowed', [
        {
          field: 'file',
          message: `Received file type "${file.mimetype}" with name "${file.originalname}". Only .csv files are accepted.`,
        },
      ]));
      return;
    }

    cb(null, true);
  },
});

module.exports = upload;