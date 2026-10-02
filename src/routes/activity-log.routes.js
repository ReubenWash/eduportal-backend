const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const tenantScope = require('../middleware/tenant');
const { authorize } = require('../middleware/roles');
const controller = require('../controllers/activity-log.controller');

router.use(authenticate, tenantScope, authorize('SCHOOL_ADMIN'));
router.get('/', controller.getActivityLogs);

module.exports = router;
