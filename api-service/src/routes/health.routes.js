const { Router } = require('express');
const healthController = require('../controllers/health.controller');

const router = Router();

/**
 * GET /api/health
 *
 * Returns system health status including all dependent services.
 *
 * Example:
 *   curl http://localhost:3000/api/health
 */
router.get('/', healthController.getHealth);

module.exports = router;