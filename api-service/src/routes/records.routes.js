const { Router } = require('express');
const recordsController = require('../controllers/records.controller');

const router = Router();

/**
 * GET /api/records
 *
 * Retrieves all records from cache (Redis) or database (PostgreSQL).
 *
 * Example:
 *   curl http://localhost:3000/api/records
 */
router.get('/', recordsController.getRecords);

module.exports = router;