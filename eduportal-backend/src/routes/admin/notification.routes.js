const express = require('express');
const router = express.Router();
const controller = require('../../controllers/notification.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

router.post('/push', controller.push);

module.exports = router;
