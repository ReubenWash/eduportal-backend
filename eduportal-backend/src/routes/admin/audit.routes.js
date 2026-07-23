const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/audit.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

router.get('/', controller.getAuditLogs);
router.get('/stats', controller.getAuditStats);
router.get('/export', controller.exportAuditLogs);
router.get('/:id', controller.getAuditLogById);

module.exports = router;