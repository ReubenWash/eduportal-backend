const { prisma } = require("../../config/db");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../../utils/paginate");
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// ─────────────────────────────────────────────────────
// SECURITY SETTINGS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/security/settings
const getSecuritySettings = async (req, res) => {
  const settings = await prisma.securitySetting.findMany();
  const settingsObj = settings.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});
  
  // Return with defaults if not set
  const defaults = {
    twoFactorRequired: false,
    maxLoginAttempts: 5,
    loginLockoutDuration: 30, // minutes
    maintenanceMode: false,
    maintenanceMessage: 'Platform is under maintenance. Please check back later.',
    ipWhitelistEnabled: false,
  };

  return sendSuccess(res, 200, 'Security settings fetched', {
    ...defaults,
    ...settingsObj
  });
};

// PATCH /api/v1/admin/security/settings
const updateSecuritySettings = async (req, res) => {
  const { settings } = req.body;
  
  if (!settings || typeof settings !== 'object') {
    throw createError('Invalid settings provided', 400);
  }

  const updates = Object.keys(settings).map(key => {
    return prisma.securitySetting.upsert({
      where: { key },
      update: { value: settings[key] },
      create: { key, value: settings[key] }
    });
  });

  await prisma.$transaction(updates);
  
  // Log this change
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'CONFIG_UPDATE',
      resource: 'SECURITY_SETTING',
      metadata: { changes: settings }
    }
  });

  return sendSuccess(res, 200, 'Security settings updated');
};

// ─────────────────────────────────────────────────────
// TWO-FACTOR AUTHENTICATION
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/security/2fa/status
const get2FAStatus = async (req, res) => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['SUPER_ADMIN', 'SCHOOL_ADMIN'] } },
    select: {
      id: true,
      email: true,
      role: true,
      twoFactorAuth: {
        select: { isEnabled: true, lastUsed: true }
      },
      staff: { select: { firstName: true, lastName: true } }
    }
  });

  const stats = {
    total: users.length,
    enabled: users.filter(u => u.twoFactorAuth?.isEnabled).length,
    disabled: users.filter(u => !u.twoFactorAuth?.isEnabled).length,
  };

  return sendSuccess(res, 200, '2FA status fetched', { stats, users });
};

// POST /api/v1/admin/security/2fa/:userId/enable
const enable2FA = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId }
  });

  if (!user) throw createError('User not found', 404);

  // Generate TOTP secret
  const secret = speakeasy.generateSecret({
    name: `EduPortal:${user.email}`
  });

  // Store secret
  await prisma.twoFactorAuth.upsert({
    where: { userId: user.id },
    update: { 
      secret: secret.base32,
      isEnabled: true,
    },
    create: {
      userId: user.id,
      secret: secret.base32,
      isEnabled: true,
    }
  });

  // Generate QR Code
  const qrCode = await QRCode.toDataURL(secret.otpauth_url);

  return sendSuccess(res, 200, '2FA enabled', {
    secret: secret.base32,
    qrCode,
    backupCodes: generateBackupCodes()
  });
};

// POST /api/v1/admin/security/2fa/:userId/disable
const disable2FA = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId }
  });

  if (!user) throw createError('User not found', 404);

  await prisma.twoFactorAuth.update({
    where: { userId: user.id },
    data: { isEnabled: false }
  });

  return sendSuccess(res, 200, '2FA disabled');
};

// Helper: Generate backup codes
const generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    codes.push(Math.random().toString(36).substring(2, 8).toUpperCase());
  }
  return codes;
};

// ─────────────────────────────────────────────────────
// IP WHITELIST
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/security/ip-whitelist
const getIpWhitelist = async (req, res) => {
  const ips = await prisma.ipWhitelist.findMany({
    orderBy: { createdAt: 'desc' }
  });
  return sendSuccess(res, 200, 'IP whitelist fetched', ips);
};

// POST /api/v1/admin/security/ip-whitelist
const addIpToWhitelist = async (req, res) => {
  const { ipAddress, label } = req.body;
  
  if (!ipAddress) throw createError('IP address is required', 400);
  
  // Validate IP/CIDR format
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!ipRegex.test(ipAddress)) {
    throw createError('Invalid IP address or CIDR format', 400);
  }

  const existing = await prisma.ipWhitelist.findUnique({
    where: { ipAddress }
  });

  if (existing) throw createError('IP already in whitelist', 409);

  const ip = await prisma.ipWhitelist.create({
    data: {
      ipAddress,
      label: label || null,
      createdBy: req.user.userId
    }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'IP_BLOCK', // Actually whitelist add
      resource: 'SECURITY_SETTING',
      metadata: { ipAddress, label }
    }
  });

  return sendSuccess(res, 201, 'IP added to whitelist', ip);
};

// DELETE /api/v1/admin/security/ip-whitelist/:id
const removeIpFromWhitelist = async (req, res) => {
  const ip = await prisma.ipWhitelist.findUnique({
    where: { id: req.params.id }
  });

  if (!ip) throw createError('IP not found in whitelist', 404);

  await prisma.ipWhitelist.delete({
    where: { id: req.params.id }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'IP_UNBLOCK',
      resource: 'SECURITY_SETTING',
      metadata: { ipAddress: ip.ipAddress }
    }
  });

  return sendSuccess(res, 200, 'IP removed from whitelist');
};

// ─────────────────────────────────────────────────────
// LOGIN ATTEMPTS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/security/login-attempts
const getLoginAttempts = async (req, res) => {
  const { skip, take, page, limit } = getPagination(req.query);
  
  const where = {};
  if (req.query.email) where.email = { contains: req.query.email, mode: 'insensitive' };
  if (req.query.ipAddress) where.ipAddress = { contains: req.query.ipAddress };
  if (req.query.success !== undefined) where.success = req.query.success === 'true';
  if (req.query.from) where.createdAt = { gte: new Date(req.query.from) };
  if (req.query.to) where.createdAt = { ...where.createdAt, lte: new Date(req.query.to) };

  const [attempts, total] = await Promise.all([
    prisma.loginAttempt.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.loginAttempt.count({ where })
  ]);

  // Get stats
  const stats = await prisma.$transaction([
    prisma.loginAttempt.count({ where: { success: true } }),
    prisma.loginAttempt.count({ where: { success: false } }),
    prisma.loginAttempt.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }
    })
  ]);

  return sendSuccess(res, 200, 'Login attempts fetched', {
    data: paginatedResponse(attempts, total, page, limit),
    stats: {
      success: stats[0],
      failed: stats[1],
      last24h: stats[2]
    }
  });
};

// POST /api/v1/admin/security/login-attempts/block-ip
const blockIp = async (req, res) => {
  const { ipAddress, reason } = req.body;
  
  if (!ipAddress) throw createError('IP address is required', 400);

  // Add to blocked IPs (we'll use a separate list or mark in login attempts)
  // For simplicity, we'll add to a blocked list in security settings
  const blockedIps = await prisma.securitySetting.findUnique({
    where: { key: 'blockedIps' }
  });

  let ips = blockedIps?.value || [];
  if (!Array.isArray(ips)) ips = [];
  
  if (!ips.includes(ipAddress)) {
    ips.push(ipAddress);
    await prisma.securitySetting.upsert({
      where: { key: 'blockedIps' },
      update: { value: ips },
      create: { key: 'blockedIps', value: ips }
    });
  }

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'IP_BLOCK',
      resource: 'SECURITY_SETTING',
      metadata: { ipAddress, reason }
    }
  });

  return sendSuccess(res, 200, 'IP blocked successfully');
};

// POST /api/v1/admin/security/login-attempts/unblock-ip
const unblockIp = async (req, res) => {
  const { ipAddress } = req.body;
  
  if (!ipAddress) throw createError('IP address is required', 400);

  const blockedIps = await prisma.securitySetting.findUnique({
    where: { key: 'blockedIps' }
  });

  let ips = blockedIps?.value || [];
  if (!Array.isArray(ips)) ips = [];
  
  ips = ips.filter(ip => ip !== ipAddress);
  
  await prisma.securitySetting.upsert({
    where: { key: 'blockedIps' },
    update: { value: ips },
    create: { key: 'blockedIps', value: ips }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'IP_UNBLOCK',
      resource: 'SECURITY_SETTING',
      metadata: { ipAddress }
    }
  });

  return sendSuccess(res, 200, 'IP unblocked successfully');
};

// ─────────────────────────────────────────────────────
// MAINTENANCE MODE
// ─────────────────────────────────────────────────────

// POST /api/v1/admin/security/maintenance
const toggleMaintenance = async (req, res) => {
  const { enabled, message } = req.body;

  await prisma.securitySetting.upsert({
    where: { key: 'maintenanceMode' },
    update: { value: enabled },
    create: { key: 'maintenanceMode', value: enabled }
  });

  if (message) {
    await prisma.securitySetting.upsert({
      where: { key: 'maintenanceMessage' },
      update: { value: message },
      create: { key: 'maintenanceMessage', value: message }
    });
  }

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId: req.user.userId,
      action: 'CONFIG_UPDATE',
      resource: 'SECURITY_SETTING',
      metadata: { maintenanceMode: enabled, message }
    }
  });

  return sendSuccess(res, 200, `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
};

module.exports = {
  getSecuritySettings,
  updateSecuritySettings,
  get2FAStatus,
  enable2FA,
  disable2FA,
  getIpWhitelist,
  addIpToWhitelist,
  removeIpFromWhitelist,
  getLoginAttempts,
  blockIp,
  unblockIp,
  toggleMaintenance,
};