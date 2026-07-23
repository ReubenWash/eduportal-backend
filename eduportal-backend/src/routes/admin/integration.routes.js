const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/integration.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');

router.use(authenticate, isSuperAdmin);

// ── Integrations ──
router.get('/', controller.getIntegrations);
router.get('/:id', controller.getIntegrationById);
router.post('/', controller.createIntegration);
router.patch('/:id', controller.updateIntegration);
router.delete('/:id', controller.deleteIntegration);
router.post('/:id/test', controller.testIntegration);

// ── Webhooks ──
router.get('/webhooks', controller.getWebhooks);
router.get('/webhooks/logs', controller.getWebhookLogs);
router.get('/webhooks/:id', controller.getWebhookById);
router.post('/webhooks', controller.createWebhook);
router.patch('/webhooks/:id', controller.updateWebhook);
router.delete('/webhooks/:id', controller.deleteWebhook);
router.post('/webhooks/:id/trigger', controller.triggerWebhook);

// ── API Keys ──
router.get('/api-keys', controller.getApiKeys);
router.get('/api-keys/:id', controller.getApiKeyById);
router.post('/api-keys', controller.createApiKey);
router.patch('/api-keys/:id', controller.updateApiKey);
router.post('/api-keys/:id/revoke', controller.revokeApiKey);
router.delete('/api-keys/:id', controller.deleteApiKey);

module.exports = router;