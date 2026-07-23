const express = require('express');
const router = express.Router();
const controller = require('../../controllers/notification.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

// GET /api/v1/admin/broadcasts — history of past broadcasts/announcements
router.get('/', controller.broadcastHistory);

module.exports = router;
