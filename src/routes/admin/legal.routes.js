const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/legal.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

// All admin legal routes require authentication and SUPER_ADMIN role
router.use(authenticate, isSuperAdmin);

// Document management
router.get('/', controller.getLegalDocuments);
router.get('/:id', controller.getLegalDocumentById);
router.post('/', controller.createLegalDocument);
router.patch('/:id', controller.updateLegalDocument);
router.delete('/:id', controller.deleteLegalDocument);

// Consent logs
router.get('/consent-logs', controller.getConsentLogs);

module.exports = router;