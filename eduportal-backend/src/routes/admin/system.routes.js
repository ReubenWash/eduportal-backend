const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/system.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

// ── Metrics ──
router.get('/metrics/current', controller.getSystemMetrics);
router.get('/metrics/history', controller.getMetricHistory);

// ── Health ──
router.get('/health', controller.getServiceHealth);
router.post('/health/check', controller.checkServiceHealth);

// ── Backups ──
router.get('/backups', controller.getBackups);
router.get('/backups/schedule', controller.getBackupSchedule);
router.get('/backups/:id', controller.getBackupById);
router.post('/backups', controller.createBackup);
router.post('/backups/schedule', controller.updateBackupSchedule);
router.post('/backups/:id/restore', controller.restoreBackup);
router.delete('/backups/:id', controller.deleteBackup);

// ── Error Logs ──
router.get('/errors', controller.getErrorLogs);
router.post('/errors/:id/resolve', controller.resolveErrorLog);

// ── Cache ──
router.get('/cache', controller.getCacheEntries);
router.post('/cache/clear', controller.clearCache);

// ── Developer Settings ──
router.get('/developer', controller.getDeveloperSettings);
router.post('/developer', controller.updateDeveloperSetting);

module.exports = router;