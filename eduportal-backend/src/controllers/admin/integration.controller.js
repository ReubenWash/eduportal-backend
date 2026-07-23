const integrationService = require("../../services/integration.service");
const apiKeyService = require("../../services/api-key.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// INTEGRATIONS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/integrations
const getIntegrations = async (req, res) => {
  const integrations = await integrationService.getIntegrations(req.query);
  return sendSuccess(res, 200, "Integrations fetched", integrations);
};

// GET /api/v1/admin/integrations/:id
const getIntegrationById = async (req, res) => {
  const integration = await integrationService.getIntegrationById(req.params.id);
  return sendSuccess(res, 200, "Integration fetched", integration);
};

// POST /api/v1/admin/integrations
const createIntegration = async (req, res) => {
  const { key, name, type, description, config, isEnabled } = req.body;

  if (!key || !name || !type) {
    throw createError("Key, name, and type are required", 400);
  }

  const integration = await integrationService.createIntegration({
    key,
    name,
    type,
    description,
    config,
    isEnabled,
    userId: req.user.userId
  });

  return sendSuccess(res, 201, "Integration created", integration);
};

// PATCH /api/v1/admin/integrations/:id
const updateIntegration = async (req, res) => {
  const { name, description, config, isEnabled, status } = req.body;

  const integration = await integrationService.updateIntegration(req.params.id, {
    name,
    description,
    config,
    isEnabled,
    status,
    userId: req.user.userId
  });

  return sendSuccess(res, 200, "Integration updated", integration);
};

// DELETE /api/v1/admin/integrations/:id
const deleteIntegration = async (req, res) => {
  await integrationService.deleteIntegration(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "Integration deleted");
};

// POST /api/v1/admin/integrations/:id/test
const testIntegration = async (req, res) => {
  const result = await integrationService.testIntegration(req.params.id);
  return sendSuccess(res, 200, "Integration test completed", result);
};

// ─────────────────────────────────────────────────────
// WEBHOOKS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/integrations/webhooks
const getWebhooks = async (req, res) => {
  const webhooks = await integrationService.getWebhooks(req.query);
  return sendSuccess(res, 200, "Webhooks fetched", webhooks);
};

// GET /api/v1/admin/integrations/webhooks/:id
const getWebhookById = async (req, res) => {
  const webhook = await integrationService.getWebhookById(req.params.id);
  return sendSuccess(res, 200, "Webhook fetched", webhook);
};

// POST /api/v1/admin/integrations/webhooks
const createWebhook = async (req, res) => {
  const { integrationId, name, url, secret, events, retryCount, timeout } = req.body;

  if (!name || !url || !events || events.length === 0) {
    throw createError("Name, URL, and at least one event are required", 400);
  }

  const webhook = await integrationService.createWebhook({
    integrationId,
    name,
    url,
    secret,
    events,
    retryCount,
    timeout,
    userId: req.user.userId
  });

  return sendSuccess(res, 201, "Webhook created", webhook);
};

// PATCH /api/v1/admin/integrations/webhooks/:id
const updateWebhook = async (req, res) => {
  const { name, url, secret, events, status, retryCount, timeout } = req.body;

  const webhook = await integrationService.updateWebhook(req.params.id, {
    name,
    url,
    secret,
    events,
    status,
    retryCount,
    timeout
  });

  return sendSuccess(res, 200, "Webhook updated", webhook);
};

// DELETE /api/v1/admin/integrations/webhooks/:id
const deleteWebhook = async (req, res) => {
  await integrationService.deleteWebhook(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "Webhook deleted");
};

// GET /api/v1/admin/integrations/webhooks/logs
const getWebhookLogs = async (req, res) => {
  const result = await integrationService.getWebhookLogs(req.query);
  return sendSuccess(res, 200, "Webhook logs fetched", result);
};

// POST /api/v1/admin/integrations/webhooks/:id/trigger
const triggerWebhook = async (req, res) => {
  const { event, payload } = req.body;

  if (!event || !payload) {
    throw createError("Event and payload are required", 400);
  }

  const result = await integrationService.triggerWebhook(req.params.id, event, payload);
  return sendSuccess(res, 200, "Webhook triggered", result);
};

// ─────────────────────────────────────────────────────
// API KEYS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/integrations/api-keys
const getApiKeys = async (req, res) => {
  const result = await apiKeyService.getApiKeys(req.query);
  return sendSuccess(res, 200, "API keys fetched", result);
};

// GET /api/v1/admin/integrations/api-keys/:id
const getApiKeyById = async (req, res) => {
  const apiKey = await apiKeyService.getApiKeyById(req.params.id);
  return sendSuccess(res, 200, "API key fetched", apiKey);
};

// POST /api/v1/admin/integrations/api-keys
const createApiKey = async (req, res) => {
  const { userId, schoolId, name, scopes, expiresAt } = req.body;

  if (!userId || !name || !scopes || scopes.length === 0) {
    throw createError("User ID, name, and at least one scope are required", 400);
  }

  const apiKey = await apiKeyService.createApiKey({
    userId,
    schoolId,
    name,
    scopes,
    expiresAt
  });

  return sendSuccess(res, 201, "API key created", apiKey);
};

// PATCH /api/v1/admin/integrations/api-keys/:id
const updateApiKey = async (req, res) => {
  const { name, scopes, isActive, expiresAt } = req.body;

  const apiKey = await apiKeyService.updateApiKey(req.params.id, {
    name,
    scopes,
    isActive,
    expiresAt,
    userId: req.user.userId
  });

  return sendSuccess(res, 200, "API key updated", apiKey);
};

// POST /api/v1/admin/integrations/api-keys/:id/revoke
const revokeApiKey = async (req, res) => {
  await apiKeyService.revokeApiKey(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "API key revoked");
};

// DELETE /api/v1/admin/integrations/api-keys/:id
const deleteApiKey = async (req, res) => {
  await apiKeyService.deleteApiKey(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "API key deleted");
};

module.exports = {
  // Integrations
  getIntegrations,
  getIntegrationById,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  testIntegration,
  
  // Webhooks
  getWebhooks,
  getWebhookById,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhookLogs,
  triggerWebhook,
  
  // API Keys
  getApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  revokeApiKey,
  deleteApiKey
};