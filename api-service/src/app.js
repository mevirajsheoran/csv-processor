const express = require('express');
const cors = require('cors');
const uploadRoutes = require('./routes/upload.routes');
const recordsRoutes = require('./routes/records.routes');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// ─── Global Middleware ──────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Request Logging ────────────────────────────────
app.use((req, _res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// ─── Routes ─────────────────────────────────────────
app.use('/api/upload', uploadRoutes);
app.use('/api/records', recordsRoutes);
// Health routes will be added in Commit 9

// ─── 404 Handler ────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
});

// ─── Global Error Handler (must be last) ────────────
app.use(errorHandler);

module.exports = app;