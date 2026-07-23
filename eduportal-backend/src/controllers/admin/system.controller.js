const systemService = require("../../services/system.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// SYSTEM METRICS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/system/metrics/current
const getSystemMetrics = async (req, res) => {
  const metric = await systemService.getSystemMetrics();
  return sendSuccess(res, 200, "System metrics fetched", metric);
};

// GET /api/v1/admin/system/metrics/history
const getMetricHistory = async (req, res) => {
  const metrics = await systemService.getMetricHistory(req.query);
  return sendSuccess(res, 200, "Metric history fetched", metrics);
};

// ─────────────────────────────────────────────────────
// SERVICE HEALTH
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/system/health
const getServiceHealth = async (req, res) => {
  const health = await systemService.getServiceHealth();
  return sendSuccess(res, 200, "Service health fetched", health);
};

// POST /api/v1/admin/system/health/check
const checkServiceHealth = async (req, res) => {
  const results = await systemService.checkServiceHealth();
  return sendSuccess(res, 200, "Health check completed", results);
};

// ─────────────────────────────────────────────────────
// BACKUPS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/system/backups
const getBackups = async (req, res) => {
  const result = await systemService.getBackups(req.query);
  return sendSuccess(res, 200, "Backups fetched", result);
};

// GET /api/v1/admin/system/backups/:id
const getBackupById = async (req, res) => {
  const backup = await systemService.getBackupById(req.params.id);
  return sendSuccess(res, 200, "Backup fetched", backup);
};

// POST /api/v1/admin/system/backups
const createBackup = async (req, res) => {
  const { type, metadata } = req.body;
  const backup = await systemService.createBackup({ type, metadata });
  return sendSuccess(res, 201, "Backup initiated", backup);
};

// POST /api/v1/admin/system/backups/:id/restore
const restoreBackup = async (req, res) => {
  const result = await systemService.restoreBackup(req.params.id, req.user.userId);
  return sendSuccess(res, 200, result.message, result);
};

// DELETE /api/v1/admin/system/backups/:id
const deleteBackup = async (req, res) => {
  await systemService.deleteBackup(req.params.id, req.user.userId);
  return sendSuccess(res, 200, "Backup deleted");
};

// GET /api/v1/admin/system/backups/schedule
const getBackupSchedule = async (req, res) => {
  const schedules = await systemService.getBackupSchedule();
  return sendSuccess(res, 200, "Backup schedules fetched", schedules);
};

// POST /api/v1/admin/system/backups/schedule
const updateBackupSchedule = async (req, res) => {
  const schedule = await systemService.updateBackupSchedule(req.body);
  return sendSuccess(res, 200, "Backup schedule updated", schedule);
};

// ─────────────────────────────────────────────────────
// ERROR LOGS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/system/errors
const getErrorLogs = async (req, res) => {
  const result = await systemService.getErrorLogs(req.query);
  return sendSuccess(res, 200, "Error logs fetched", result);
};

// POST /api/v1/admin/system/errors/:id/resolve
const resolveErrorLog = async (req, res) => {
  const { notes } = req.body;
  const log = await systemService.resolveErrorLog(req.params.id, req.user.userId, notes);
  return sendSuccess(res, 200, "Error resolved", log);
};

// ─────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/system/cache
const getCacheEntries = async (req, res) => {
  const result = await systemService.getCacheEntries(req.query);
  return sendSuccess(res, 200, "Cache entries fetched", result);
};

// POST /api/v1/admin/system/cache/clear
const clearCache = async (req, res) => {
  const { key } = req.body;
  const result = await systemService.clearCache(key, req.user.userId);
  return sendSuccess(res, 200, result.message, result);
};

// ─────────────────────────────────────────────────────
// DEVELOPER SETTINGS
// ─────────────────────────────────────────────────────

// GET /api/v1/admin/system/developer
const getDeveloperSettings = async (req, res) => {
  const settings = await systemService.getDeveloperSettings();
  return sendSuccess(res, 200, "Developer settings fetched", settings);
};

// POST /api/v1/admin/system/developer
const updateDeveloperSetting = async (req, res) => {
  const { key, value } = req.body;
  
  if (!key) {
    throw createError("Key is required", 400);
  }

  const setting = await systemService.updateDeveloperSetting(key, value, req.user.userId);
  return sendSuccess(res, 200, "Developer setting updated", setting);
};

module.exports = {
  getSystemMetrics,
  getMetricHistory,
  getServiceHealth,
  checkServiceHealth,
  getBackups,
  getBackupById,
  createBackup,
  restoreBackup,
  deleteBackup,
  getBackupSchedule,
  updateBackupSchedule,
  getErrorLogs,
  resolveErrorLog,
  getCacheEntries,
  clearCache,
  getDeveloperSettings,
  updateDeveloperSetting
};