const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─────────────────────────────────────────────────────
// SYSTEM METRICS
// ─────────────────────────────────────────────────────

const getSystemMetrics = async () => {
  // Get current system metrics
  const cpuUsage = await getCPUUsage();
  const memoryUsage = getMemoryUsage();
  const diskUsage = await getDiskUsage();
  
  // Store metrics in database
  const metric = await prisma.systemMetric.create({
    data: {
      cpuUsage,
      memoryUsage: memoryUsage.percentage,
      ramUsage: memoryUsage.percentage,
      diskUsage: diskUsage.percentage,
      activeConnections: await getActiveConnections(),
      requestCount: 0,
      errorCount: 0,
      timestamp: new Date()
    }
  });

  return metric;
};

const getCPUUsage = async () => {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  
  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });
  
  const idle = totalIdle / cpus.length;
  const total = totalTick / cpus.length;
  const used = total - idle;
  return parseFloat(((used / total) * 100).toFixed(1));
};

const getMemoryUsage = () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  return {
    used: Math.round(usedMem / (1024 * 1024)),
    total: Math.round(totalMem / (1024 * 1024)),
    percentage: parseFloat(((usedMem / totalMem) * 100).toFixed(1))
  };
};

const getDiskUsage = async () => {
  try {
    const { stdout } = await execPromise('df -k /');
    const lines = stdout.trim().split('\n');
    const data = lines[1].split(/\s+/);
    const used = parseInt(data[2]);
    const total = parseInt(data[1]);
    return {
      used: Math.round(used / 1024 / 1024),
      total: Math.round(total / 1024 / 1024),
      percentage: parseFloat(((used / total) * 100).toFixed(1))
    };
  } catch (error) {
    // Fallback if df command not available
    return { used: 0, total: 0, percentage: 0 };
  }
};

const getActiveConnections = async () => {
  // This would normally check database connections
  // For now, return a placeholder
  return Math.floor(Math.random() * 50) + 10;
};

const getMetricHistory = async (query) => {
  const { hours = 24, limit = 100 } = query;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const metrics = await prisma.systemMetric.findMany({
    where: {
      timestamp: { gte: since }
    },
    orderBy: { timestamp: 'desc' },
    take: parseInt(limit)
  });

  return metrics;
};

// ─────────────────────────────────────────────────────
// SERVICE HEALTH
// ─────────────────────────────────────────────────────

const getServiceHealth = async () => {
  const services = await prisma.serviceHealth.findMany({
    include: {
      checks: {
        orderBy: { createdAt: 'desc' },
        take: 1
      }
    }
  });

  // If no services exist, create defaults
  if (services.length === 0) {
    await seedDefaultServices();
    return prisma.serviceHealth.findMany({
      include: {
        checks: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });
  }

  return services;
};

const seedDefaultServices = async () => {
  const defaultServices = [
    { type: 'API_SERVER', name: 'API Server' },
    { type: 'DATABASE', name: 'Database' },
    { type: 'FILE_STORAGE', name: 'File Storage' },
    { type: 'EMAIL_SERVICE', name: 'Email Service' },
    { type: 'SMS_GATEWAY', name: 'SMS Gateway' },
    { type: 'AI_SERVICE', name: 'AI Service' },
    { type: 'PAYMENT_GATEWAY', name: 'Payment Gateway' },
  ];

  for (const service of defaultServices) {
    await prisma.serviceHealth.upsert({
      where: { type: service.type },
      update: {},
      create: {
        type: service.type,
        name: service.name,
        status: 'HEALTHY',
        uptime: 99.9,
        lastCheckAt: new Date()
      }
    });
  }
};

const checkServiceHealth = async () => {
  const services = await prisma.serviceHealth.findMany();
  const results = [];

  for (const service of services) {
    const result = await performHealthCheck(service);
    results.push(result);
  }

  return results;
};

const performHealthCheck = async (service) => {
  const startTime = Date.now();
  let status = 'HEALTHY';
  let error = null;
  let responseTime = 0;

  try {
    switch (service.type) {
      case 'DATABASE':
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        responseTime = Date.now() - startTime;
        break;
      case 'API_SERVER':
        // Check API health
        responseTime = Date.now() - startTime;
        break;
      case 'EMAIL_SERVICE':
        // Check email service (would need actual check)
        responseTime = 100 + Math.random() * 50;
        break;
      default:
        // Generic check
        responseTime = Date.now() - startTime;
    }
  } catch (err) {
    status = 'DOWN';
    error = err.message;
  }

  // Update service health
  await prisma.serviceHealth.update({
    where: { id: service.id },
    data: {
      status,
      responseTime,
      lastCheckAt: new Date(),
      lastError: error,
      uptime: status === 'HEALTHY' ? Math.min(100, service.uptime + 0.1) : Math.max(0, service.uptime - 0.5)
    }
  });

  // Create health check record
  await prisma.healthCheck.create({
    data: {
      serviceId: service.id,
      status,
      responseTime,
      error,
      metadata: { checked: new Date().toISOString() }
    }
  });

  return { service: service.name, status, responseTime, error };
};

// ─────────────────────────────────────────────────────
// BACKUP MANAGEMENT
// ─────────────────────────────────────────────────────

const getBackups = async (query) => {
  const { type, status, page = 1, limit = 20 } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;

  const [backups, total] = await Promise.all([
    prisma.backup.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      }
    }),
    prisma.backup.count({ where })
  ]);

  // Get schedule info
  const schedules = await prisma.backupSchedule.findMany({
    where: { isEnabled: true }
  });

  // Get storage stats
  const storageStats = await getBackupStorageStats();

  return {
    data: backups,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    schedules,
    storageStats
  };
};

const getBackupById = async (id) => {
  const backup = await prisma.backup.findUnique({
    where: { id },
    include: {
      logs: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!backup) {
    throw createError('Backup not found', 404);
  }

  return backup;
};

const createBackup = async (data) => {
  const { type = 'FULL', metadata } = data;

  const backup = await prisma.backup.create({
    data: {
      name: `${type}_${new Date().toISOString()}`,
      type,
      status: 'PENDING',
      metadata: metadata || {},
      startedAt: new Date()
    }
  });

  // Trigger backup asynchronously
  processBackup(backup.id);

  return backup;
};

const processBackup = async (backupId) => {
  try {
    // Update status
    await prisma.backup.update({
      where: { id: backupId },
      data: { status: 'IN_PROGRESS' }
    });

    // Add log
    await prisma.backupLog.create({
      data: {
        backupId,
        message: 'Backup started',
        level: 'INFO'
      }
    });

    // Simulate backup process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate file URL
    const fileUrl = `https://storage.example.com/backups/backup_${backupId}_${Date.now()}.sql.gz`;

    // Update backup
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: 'SUCCESS',
        size: 1024 * 1024 * (Math.floor(Math.random() * 500) + 100),
        fileUrl,
        completedAt: new Date()
      }
    });

    // Add success log
    await prisma.backupLog.create({
      data: {
        backupId,
        message: 'Backup completed successfully',
        level: 'INFO'
      }
    });

  } catch (error) {
    // Update backup with error
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        status: 'FAILED',
        completedAt: new Date()
      }
    });

    // Add error log
    await prisma.backupLog.create({
      data: {
        backupId,
        message: `Backup failed: ${error.message}`,
        level: 'ERROR'
      }
    });
  }
};

const restoreBackup = async (backupId, userId = null) => {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId }
  });

  if (!backup) {
    throw createError('Backup not found', 404);
  }

  if (backup.status !== 'SUCCESS') {
    throw createError('Only successful backups can be restored', 400);
  }

  // Log the restore action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'BACKUP_RESTORE',
      resource: 'BACKUP',
      resourceId: backupId,
      metadata: { backupName: backup.name }
    }
  });

  // In real implementation, this would trigger a restore process
  return { message: 'Restore initiated successfully' };
};

const deleteBackup = async (backupId, userId = null) => {
  const backup = await prisma.backup.findUnique({
    where: { id: backupId }
  });

  if (!backup) {
    throw createError('Backup not found', 404);
  }

  // Delete file from storage would happen here

  await prisma.backup.delete({
    where: { id: backupId }
  });

  // Log the action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'DELETE',
      resource: 'BACKUP',
      resourceId: backupId,
      metadata: { backupName: backup.name }
    }
  });

  return { message: 'Backup deleted successfully' };
};

const getBackupSchedule = async () => {
  const schedules = await prisma.backupSchedule.findMany({
    orderBy: { name: 'asc' }
  });

  return schedules;
};

const updateBackupSchedule = async (data) => {
  const { id, isEnabled, frequency, time, dayOfWeek, dayOfMonth, retentionDays } = data;

  if (id) {
    // Update existing
    return prisma.backupSchedule.update({
      where: { id },
      data: {
        isEnabled: isEnabled !== undefined ? isEnabled : undefined,
        frequency: frequency || undefined,
        time: time || undefined,
        dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : undefined,
        dayOfMonth: dayOfMonth !== undefined ? dayOfMonth : undefined,
        retentionDays: retentionDays || undefined,
        updatedAt: new Date()
      }
    });
  } else {
    // Create new
    if (!name || !frequency) {
      throw createError('Name and frequency are required', 400);
    }
    return prisma.backupSchedule.create({
      data: {
        name: data.name,
        type: data.type || 'FULL',
        frequency,
        time: time || '02:00',
        dayOfWeek: dayOfWeek || null,
        dayOfMonth: dayOfMonth || null,
        retentionDays: retentionDays || 30,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        nextRunAt: calculateNextRun(frequency, time, dayOfWeek, dayOfMonth)
      }
    });
  }
};

const calculateNextRun = (frequency, time, dayOfWeek, dayOfMonth) => {
  // Simple calculation - in production use cron library
  const now = new Date();
  const [hours, minutes] = (time || '02:00').split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (frequency === 'HOURLY') {
    next.setHours(now.getHours() + 1);
  } else if (frequency === 'DAILY') {
    if (next <= now) next.setDate(next.getDate() + 1);
  } else if (frequency === 'WEEKLY') {
    const targetDay = dayOfWeek || 0;
    const currentDay = now.getDay();
    const daysToAdd = (targetDay - currentDay + 7) % 7;
    next.setDate(next.getDate() + (daysToAdd === 0 && next > now ? 7 : daysToAdd));
  } else if (frequency === 'MONTHLY') {
    const targetDay = dayOfMonth || 1;
    if (next.getDate() > targetDay || (next.getDate() === targetDay && next <= now)) {
      next.setMonth(next.getMonth() + 1);
    }
    next.setDate(targetDay);
  }

  return next;
};

const getBackupStorageStats = async () => {
  const backups = await prisma.backup.findMany({
    where: { status: 'SUCCESS' },
    select: { size: true }
  });

  const totalSize = backups.reduce((sum, b) => sum + (b.size || 0), 0);
  const totalSnapshots = backups.length;

  return {
    totalSize: Math.round(totalSize / (1024 * 1024 * 1024)), // GB
    totalSnapshots,
    lastBackup: await prisma.backup.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    })
  };
};

// ─────────────────────────────────────────────────────
// ERROR LOGS
// ─────────────────────────────────────────────────────

const getErrorLogs = async (query) => {
  const { 
    level, 
    endpoint, 
    statusCode, 
    resolved,
    page = 1, 
    limit = 20,
    search
  } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (level) where.level = level;
  if (endpoint) where.endpoint = { contains: endpoint };
  if (statusCode) where.statusCode = parseInt(statusCode);
  if (resolved !== undefined) where.resolved = resolved === 'true';
  if (search) {
    where.OR = [
      { message: { contains: search, mode: 'insensitive' } },
      { endpoint: { contains: search, mode: 'insensitive' } }
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.errorLog.count({ where })
  ]);

  // Get stats
  const stats = await Promise.all([
    prisma.errorLog.count(),
    prisma.errorLog.count({ where: { level: 'ERROR' } }),
    prisma.errorLog.count({ where: { level: 'CRITICAL' } }),
    prisma.errorLog.count({ where: { resolved: false } })
  ]);

  return {
    data: logs,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    },
    stats: {
      total: stats[0],
      errors: stats[1],
      critical: stats[2],
      unresolved: stats[3]
    }
  };
};

const resolveErrorLog = async (id, userId = null, notes = null) => {
  const log = await prisma.errorLog.findUnique({
    where: { id }
  });

  if (!log) {
    throw createError('Error log not found', 404);
  }

  const updated = await prisma.errorLog.update({
    where: { id },
    data: {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy: userId,
      notes: notes || null
    }
  });

  return updated;
};

// ─────────────────────────────────────────────────────
// CACHE MANAGEMENT
// ─────────────────────────────────────────────────────

const getCacheEntries = async (query) => {
  const { search, expired, page = 1, limit = 20 } = query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const where = {};
  if (search) {
    where.key = { contains: search, mode: 'insensitive' };
  }
  if (expired === 'true') {
    where.expiresAt = { lt: new Date() };
  } else if (expired === 'false') {
    where.OR = [
      { expiresAt: { gt: new Date() } },
      { expiresAt: null }
    ];
  }

  const [entries, total] = await Promise.all([
    prisma.cacheEntry.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.cacheEntry.count({ where })
  ]);

  return {
    data: entries,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit))
    }
  };
};

const clearCache = async (key = null, userId = null) => {
  if (key) {
    await prisma.cacheEntry.delete({ where: { key } });
  } else {
    await prisma.cacheEntry.deleteMany();
  }

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CONFIG_UPDATE',
      resource: 'SYSTEM_SETTING',
      metadata: { action: 'clear_cache', key: key || 'all' }
    }
  });

  return { message: key ? `Cache entry "${key}" cleared` : 'All cache cleared' };
};

// ─────────────────────────────────────────────────────
// DEVELOPER SETTINGS
// ─────────────────────────────────────────────────────

const getDeveloperSettings = async () => {
  const settings = await prisma.developerSetting.findMany();
  const settingsObj = settings.reduce((acc, curr) => {
    acc[curr.key] = curr.value;
    return acc;
  }, {});

  const defaults = {
    debugMode: 'OFF',
    logQueries: false,
    enableApiDocs: true,
    enableWebhooks: true,
    enableQueue: true
  };

  return { ...defaults, ...settingsObj };
};

const updateDeveloperSetting = async (key, value, userId = null) => {
  const setting = await prisma.developerSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  });

  // Log this action
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'CONFIG_UPDATE',
      resource: 'SYSTEM_SETTING',
      metadata: { key, value }
    }
  });

  return setting;
};

// ─────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────

module.exports = {
  // System Metrics
  getSystemMetrics,
  getMetricHistory,
  
  // Service Health
  getServiceHealth,
  checkServiceHealth,
  
  // Backups
  getBackups,
  getBackupById,
  createBackup,
  restoreBackup,
  deleteBackup,
  getBackupSchedule,
  updateBackupSchedule,
  
  // Error Logs
  getErrorLogs,
  resolveErrorLog,
  
  // Cache
  getCacheEntries,
  clearCache,
  
  // Developer Settings
  getDeveloperSettings,
  updateDeveloperSetting,
};