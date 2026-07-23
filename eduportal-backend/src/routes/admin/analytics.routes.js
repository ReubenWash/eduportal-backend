const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/platformAnalytics.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

router.get('/', controller.getDashboard);

module.exports = router;
