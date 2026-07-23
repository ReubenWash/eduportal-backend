const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/adminEmail.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

router.post('/welcome', controller.sendWelcomeEmail);

module.exports = router;
