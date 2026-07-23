const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const axios = require('axios');

// ─────────────────────────────────────────────────────
// INTEGRATIONS
// ─────────────────────────────────────────────────────

const getIntegrations = async (query) => {
  const { type, status, isEnabled } = query;

  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (isEnabled !== undefined) where.isEnabled = isEnabled === 'true';

  const integrations = await prisma.integration.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      webhooks: {
        where: { status: 'ACTIVE' }
      }
    }
  });

  return integrations;
};

const getIntegrationById = async (id) => {
  const integration = await prisma.integration.findUnique({
    where: { id },
    include: {
      webhooks: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });

  if (!integration) {
    throw createError('Integration not found', 404);
  }

  return integration;
};

const getIntegrationByKey = async (key) => {
  const integration = await prisma.integration.findUnique({
    where: { key }
  });

  return integration;
};

const createIntegration = async (data) => {
  const { key, name, type, description, config, isEnabled = false } = data;

  if (!key || !name || !type) {
    throw createError('Key, name, and type are required', 400);
  }

  // Check for duplicate key
  const existing = await prisma.integration.findUnique({
    where: { key }
  });

  if (existing) {
    throw createError('Integration with this key already exists', 409);
  }

  const integration = await prisma.integration.create({
    data: {
      key,
      name,
      type,
      description: description || null,
      config: config || {},
      isEnabled,
      status: isEnabled ? 'ACTIVE' : 'INACTIVE'
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: 'CREATE',
      resource: 'INTEGRATION',
      resourceId: integration.id,
      metadata: { key, name, type }
    }
  });

  return integration;
};

const updateIntegration = async (id, data) => {
  const { name, description, config, isEnabled, status } = data;

  const integration = await prisma.integration.findUnique({
    where: { id }
  });

  if (!integration) {
    throw createError('Integration not found', 404);
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (config) updateData.config = config;
  if (isEnabled !== undefined) {
    updateData.isEnabled = isEnabled;
    updateData.status = isEnabled ? 'ACTIVE' : 'INACTIVE';
  }
  if (status) updateData.status = status;

  const updated = await prisma.integration.update({
    where: { id },
    data: updateData
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: 'UPDATE',
      resource: 'INTEGRATION',
      resourceId: id,
      metadata: { 
        name: name || integration.name,
        enabled: isEnabled !== undefined ? isEnabled : integration.isEnabled
      }
    }
  });

  return updated;
};

const deleteIntegration = async (id, userId = null) => {
  const integration = await prisma.integration.findUnique({
    where: { id }
  });

  if (!integration) {
    throw createError('Integration not found', 404);
  }

  // Delete webhooks first (cascade will handle)
  await prisma.integration.delete({
    where: { id }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'DELETE',
      resource: 'INTEGRATION',
      resourceId: id,
      metadata: { name: integration.name }
    }
  });

  return { message: 'Integration deleted successfully' };
};

const testIntegration = async (id) => {
  const integration = await prisma.integration.findUnique({
    where: { id }
  });

  if (!integration) {
    throw createError('Integration not found', 404);
  }

  try {
    // Test based on integration type
    let result = { success: true, message: 'Integration test successful' };

    switch (integration.type) {
      case 'EMAIL':
        // Test SMTP connection
        result = await testEmailIntegration(integration.config);
        break;
      case 'SMS':
        // Test SMS gateway
        result = await testSmsIntegration(integration.config);
        break;
      case 'PAYMENT':
        // Test payment gateway
        result = await testPaymentIntegration(integration.config);
        break;
      case 'STORAGE':
        // Test storage
        result = await testStorageIntegration(integration.config);
        break;
      case 'AI':
        // Test AI API
        result = await testAiIntegration(integration.config);
        break;
      default:
        // Generic test - try to ping the endpoint
        result = await testGenericIntegration(integration.config);
    }

    // Update integration status
    await prisma.integration.update({
      where: { id },
      data: {
        status: result.success ? 'ACTIVE' : 'ERROR',
        lastTestedAt: new Date(),
        lastError: result.success ? null : result.message
      }
    });

    return result;
  } catch (error) {
    // Update integration with error
    await prisma.integration.update({
      where: { id },
      data: {
        status: 'ERROR',
        lastTestedAt: new Date(),
        lastError: error.message
      }
    });

    throw createError(`Integration test failed: ${error.message}`, 400);
  }
};

// ─────────────────────────────────────────────────────
// INTEGRATION TEST HELPERS
// ─────────────────────────────────────────────────────

const testEmailIntegration = async (config) => {
  // Test SMTP or email API
  const { host, port, username, password } = config;
  
  if (!host || !port) {
    return { success: false, message: 'SMTP host and port are required' };
  }

  // Simple validation - we'll just check if we can connect
  // In production, you'd actually test the connection
  return { success: true, message: 'Email configuration is valid' };
};

const testSmsIntegration = async (config) => {
  const { apiKey, phoneNumber } = config;
  
  if (!apiKey) {
    return { success: false, message: 'API key is required for SMS' };
  }

  return { success: true, message: 'SMS configuration is valid' };
};

const testPaymentIntegration = async (config) => {
  const { apiKey, secretKey, mode } = config;
  
  if (!apiKey || !secretKey) {
    return { success: false, message: 'API key and secret key are required' };
  }

  return { success: true, message: 'Payment configuration is valid' };
};

const testStorageIntegration = async (config) => {
  const { apiKey, bucket, region } = config;
  
  if (!apiKey || !bucket) {
    return { success: false, message: 'API key and bucket are required' };
  }

  return { success: true, message: 'Storage configuration is valid' };
};

const testAiIntegration = async (config) => {
  const { apiKey, model } = config;
  
  if (!apiKey) {
    return { success: false, message: 'API key is required for AI' };
  }

  return { success: true, message: 'AI configuration is valid' };
};

const testGenericIntegration = async (config) => {
  const { endpoint } = config;
  
  if (!endpoint) {
    return { success: false, message: 'Endpoint URL is required' };
  }

  try {
    await axios.get(endpoint, { timeout: 5000 });
    return { success: true, message: 'Endpoint is reachable' };
  } catch (error) {
    return { success: false, message: `Endpoint test failed: ${error.message}` };
  }
};

// ─────────────────────────────────────────────────────
// WEBHOOKS
// ─────────────────────────────────────────────────────

const getWebhooks = async (query) => {
  const { integrationId, status, event } = query;

  const where = {};
  if (integrationId) where.integrationId = integrationId;
  if (status) where.status = status;
  if (event) where.events = { has: event };

  const webhooks = await prisma.webhook.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          type: true
        }
      },
      logs: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  });

  return webhooks;
};

const getWebhookById = async (id) => {
  const webhook = await prisma.webhook.findUnique({
    where: { id },
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          type: true
        }
      },
      logs: {
        orderBy: { createdAt: 'desc' },
        take: 20
      }
    }
  });

  if (!webhook) {
    throw createError('Webhook not found', 404);
  }

  return webhook;
};

const createWebhook = async (data) => {
  const { integrationId, name, url, secret, events, retryCount, timeout } = data;

  if (!name || !url || !events || events.length === 0) {
    throw createError('Name, URL, and at least one event are required', 400);
  }

  // Generate secret if not provided
  const webhookSecret = secret || generateWebhookSecret();

  const webhook = await prisma.webhook.create({
    data: {
      integrationId: integrationId || null,
      name,
      url,
      secret: webhookSecret,
      events,
      retryCount: retryCount || 3,
      timeout: timeout || 5000,
      status: 'ACTIVE'
    },
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          type: true
        }
      }
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: 'CREATE',
      resource: 'WEBHOOK',
      resourceId: webhook.id,
      metadata: { name, url, events }
    }
  });

  return webhook;
};

const updateWebhook = async (id, data) => {
  const { name, url, secret, events, status, retryCount, timeout } = data;

  const webhook = await prisma.webhook.findUnique({
    where: { id }
  });

  if (!webhook) {
    throw createError('Webhook not found', 404);
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (url) updateData.url = url;
  if (secret) updateData.secret = secret;
  if (events) updateData.events = events;
  if (status) updateData.status = status;
  if (retryCount !== undefined) updateData.retryCount = retryCount;
  if (timeout !== undefined) updateData.timeout = timeout;

  const updated = await prisma.webhook.update({
    where: { id },
    data: updateData,
    include: {
      integration: {
        select: {
          id: true,
          name: true,
          type: true
        }
      }
    }
  });

  return updated;
};

const deleteWebhook = async (id, userId = null) => {
  const webhook = await prisma.webhook.findUnique({
    where: { id }
  });

  if (!webhook) {
    throw createError('Webhook not found', 404);
  }

  await prisma.webhook.delete({
    where: { id }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'DELETE',
      resource: 'WEBHOOK',
      resourceId: id,
      metadata: { name: webhook.name }
    }
  });

  return { message: 'Webhook deleted successfully' };
};

const getWebhookLogs = async (query) => {
  const { webhookId, event, success, page = 1, limit = 20 } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (webhookId) where.webhookId = webhookId;
  if (event) where.event = event;
  if (success !== undefined) where.success = success === 'true';

  const [logs, total] = await Promise.all([
    prisma.webhookLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        webhook: {
          select: {
            id: true,
            name: true,
            url: true
          }
        }
      }
    }),
    prisma.webhookLog.count({ where })
  ]);

  return {
    data: logs,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const triggerWebhook = async (webhookId, event, payload) => {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId }
  });

  if (!webhook) {
    throw createError('Webhook not found', 404);
  }

  if (webhook.status !== 'ACTIVE') {
    throw createError('Webhook is not active', 400);
  }

  // Check if event is subscribed
  if (!webhook.events.includes(event)) {
    throw createError(`Webhook is not subscribed to event: ${event}`, 400);
  }

  let attempts = 0;
  let success = false;
  let response = null;
  let error = null;
  const startTime = Date.now();

  while (attempts < webhook.retryCount && !success) {
    attempts++;
    try {
      const response = await axios.post(webhook.url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': generateWebhookSignature(payload, webhook.secret),
          'X-Event': event,
          'X-Attempt': attempts
        },
        timeout: webhook.timeout
      });

      success = true;
      response = {
        status: response.status,
        body: response.data
      };
    } catch (err) {
      error = err.message;
      if (attempts < webhook.retryCount) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }

  // Log the attempt
  const log = await prisma.webhookLog.create({
    data: {
      webhookId: webhook.id,
      event,
      payload,
      responseStatus: response?.status || null,
      responseBody: response?.body ? JSON.stringify(response.body) : null,
      error: error || null,
      durationMs: Date.now() - startTime,
      attempt: attempts,
      success
    }
  });

  // Update webhook last triggered
  await prisma.webhook.update({
    where: { id: webhookId },
    data: {
      lastTriggeredAt: new Date(),
      lastError: error || null,
      status: success ? 'ACTIVE' : 'ERROR'
    }
  });

  return { success, log };
};

// ─────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────

const generateWebhookSecret = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

const generateWebhookSignature = (payload, secret) => {
  const crypto = require('crypto');
  const data = JSON.stringify(payload);
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  // Integrations
  getIntegrations,
  getIntegrationById,
  getIntegrationByKey,
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
  triggerWebhook
};