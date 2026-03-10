const { Router } = require('express');
const upload = require('../middleware/fileUpload');
const uploadController = require('../controllers/upload.controller');

const router = Router();

/**
 * POST /api/upload
 *
 * Accepts a CSV file via multipart/form-data.
 * Field name must be "file".
 *
 * Example:
 *   curl -X POST http://localhost:3000/api/upload -F "file=@products.csv"
 */
router.post('/', upload.single('file'), uploadController.uploadCsv);

module.exports = router;