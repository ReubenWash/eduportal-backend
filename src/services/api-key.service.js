const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const crypto = require('crypto');

// ─────────────────────────────────────────────────────
// API KEY HELPERS
// ─────────────────────────────────────────────────────

const generateApiKey = () => {
  const prefix = 'ep_';
  const random = crypto.randomBytes(32).toString('hex');
  return `${prefix}${random}`;
};

const generateKeyPrefix = (key) => {
  return key.substring(0, 8);
};

const hashApiKey = (key) => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

// ─────────────────────────────────────────────────────
// API KEY CRUD
// ─────────────────────────────────────────────────────

const getApiKeys = async (query) => {
  const { userId, schoolId, isActive, page = 1, limit = 20 } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (userId) where.userId = userId;
  if (schoolId) where.schoolId = schoolId;
  if (isActive !== undefined) where.isActive = isActive === 'true';

  const [apiKeys, total] = await Promise.all([
    prisma.apiKey.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            staff: {
              select: { firstName: true, lastName: true }
            }
          }
        },
        school: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.apiKey.count({ where })
  ]);

  // Don't return the full key hash, just the prefix
  const sanitizedKeys = apiKeys.map(key => ({
    ...key,
    key: key.keyPrefix
  }));

  return {
    data: sanitizedKeys,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const getApiKeyById = async (id) => {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          staff: {
            select: { firstName: true, lastName: true }
          }
        }
      },
      school: {
        select: {
          id: true,
          name: true
        }
      },
      usageLogs: {
        orderBy: { createdAt: 'desc' },
        take: 10
      }
    }
  });

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  return apiKey;
};

const createApiKey = async (data) => {
  const { userId, schoolId, name, scopes, expiresAt } = data;

  if (!userId || !name || !scopes || scopes.length === 0) {
    throw createError('User ID, name, and at least one scope are required', 400);
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw createError('User not found', 404);
  }

  // If schoolId provided, verify school exists
  if (schoolId) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId }
    });
    if (!school) {
      throw createError('School not found', 404);
    }
  }

  // Generate API key
  const rawKey = generateApiKey();
  const hashedKey = hashApiKey(rawKey);
  const keyPrefix = generateKeyPrefix(rawKey);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      schoolId: schoolId || null,
      name,
      key: hashedKey,
      keyPrefix,
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      isActive: true
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true
        }
      }
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CREATE',
      resource: 'API_KEY',
      resourceId: apiKey.id,
      metadata: { name, scopes }
    }
  });

  // Return the raw key (only shown once)
  return {
    ...apiKey,
    rawKey // This should be shown to the user and stored securely
  };
};

const updateApiKey = async (id, data) => {
  const { name, scopes, isActive, expiresAt } = data;

  const apiKey = await prisma.apiKey.findUnique({
    where: { id }
  });

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (scopes) updateData.scopes = scopes;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const updated = await prisma.apiKey.update({
    where: { id },
    data: updateData
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: data.userId || null,
      action: 'UPDATE',
      resource: 'API_KEY',
      resourceId: id,
      metadata: { name: name || apiKey.name }
    }
  });

  return updated;
};

const revokeApiKey = async (id, userId = null) => {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id }
  });

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  const updated = await prisma.apiKey.update({
    where: { id },
    data: { isActive: false }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: userId || null,
      action: 'DELETE',
      resource: 'API_KEY',
      resourceId: id,
      metadata: { name: apiKey.name }
    }
  });

  return { message: 'API key revoked successfully' };
};

const deleteApiKey = async (id, userId = null) => {
  const apiKey = await prisma.apiKey.findUnique({
    where: { id }
  });

  if (!apiKey) {
    throw createError('API key not found', 404);
  }

  await prisma.apiKey.delete({
    where: { id }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: userId || null,
      action: 'DELETE',
      resource: 'API_KEY',
      resourceId: id,
      metadata: { name: apiKey.name }
    }
  });

  return { message: 'API key deleted successfully' };
};

// ─────────────────────────────────────────────────────
// API KEY VALIDATION
// ─────────────────────────────────────────────────────

const validateApiKey = async (key, requiredScopes = []) => {
  const hashedKey = hashApiKey(key);
  
  const apiKey = await prisma.apiKey.findFirst({
    where: {
      key: hashedKey,
      isActive: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true
        }
      }
    }
  });

  if (!apiKey) {
    return { valid: false, error: 'Invalid or expired API key' };
  }

  if (!apiKey.user.isActive) {
    return { valid: false, error: 'User account is inactive' };
  }

  // Check scopes
  if (requiredScopes.length > 0) {
    const hasAllScopes = requiredScopes.every(scope => 
      apiKey.scopes.includes(scope) || apiKey.scopes.includes('ADMIN_ALL')
    );
    if (!hasAllScopes) {
      return { valid: false, error: 'Insufficient scopes' };
    }
  }

  // Update last used
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() }
  });

  return { 
    valid: true, 
    apiKey,
    user: apiKey.user
  };
};

const logApiKeyUsage = async (apiKeyId, endpoint, method, ipAddress, statusCode, responseTimeMs) => {
  await prisma.apiKeyUsageLog.create({
    data: {
      apiKeyId,
      endpoint,
      method,
      ipAddress: ipAddress || null,
      statusCode,
      responseTimeMs: responseTimeMs || null
    }
  });
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  getApiKeys,
  getApiKeyById,
  createApiKey,
  updateApiKey,
  revokeApiKey,
  deleteApiKey,
  validateApiKey,
  logApiKeyUsage,
  generateApiKey
};