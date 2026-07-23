const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/security.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

// Settings
router.get('/settings', controller.getSecuritySettings);
router.patch('/settings', controller.updateSecuritySettings);

// 2FA
router.get('/2fa/status', controller.get2FAStatus);
router.post('/2fa/:userId/enable', controller.enable2FA);
router.post('/2fa/:userId/disable', controller.disable2FA);

// IP Whitelist
router.get('/ip-whitelist', controller.getIpWhitelist);
router.post('/ip-whitelist', controller.addIpToWhitelist);
router.delete('/ip-whitelist/:id', controller.removeIpFromWhitelist);

// Login Attempts
router.get('/login-attempts', controller.getLoginAttempts);
router.post('/login-attempts/block-ip', controller.blockIp);
router.post('/login-attempts/unblock-ip', controller.unblockIp);

// Maintenance
router.post('/maintenance', controller.toggleMaintenance);

module.exports = router;