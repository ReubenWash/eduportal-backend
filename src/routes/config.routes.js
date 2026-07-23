const express = require('express');
const router = express.Router();
const configController = require('../controllers/config.controller');
const authenticate = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/roles');

// Public route
router.get('/public', configController.getPublicSettings);

// Only Super Admins can update system environment variables
router.use(authenticate, isSuperAdmin);

router.post('/env', configController.updateEnvConfig);
router.get('/settings', configController.getSettings);
router.put('/settings', configController.updateSettings);

module.exports = router;