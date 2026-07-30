const express = require('express');
const router = express.Router();
const controller = require('../controllers/legal.controller');

// Public legal routes (no authentication required)
router.get('/', controller.getLegalDocuments);
router.get('/:type', controller.getLegalDocumentByType);

module.exports = router;