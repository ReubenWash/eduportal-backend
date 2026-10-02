const { prisma } = require("../../config/db");
const { sendSuccess } = require("../../utils/apiResponse");
const { createError } = require("../../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../../utils/paginate");

const buildAuditWhere = (query) => {
  const where = {};
  if (query.action) where.action = query.action;
  if (query.resource) where.resource = query.resource;
  if (query.userId) where.userId = query.userId;
  if (query.schoolId) where.schoolId = query.schoolId;
  if (query.role) where.user = { role: query.role };
  if (query.search) {
    where.OR = [
      { userId: { contains: query.search, mode: 'insensitive' } },
      { resourceId: { contains: query.search, mode: 'insensitive' } },
      { ipAddress: { contains: query.search, mode: 'insensitive' } },
      { user: { email: { contains: query.search, mode: 'insensitive' } } },
      { user: { staff: { firstName: { contains: query.search, mode: 'insensitive' } } } },
      { user: { staff: { lastName: { contains: query.search, mode: 'insensitive' } } } },
      { school: { name: { contains: query.search, mode: 'insensitive' } } },
      { metadata: { path: ['route'], string_contains: query.search } },
    ];
  }
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  return where;
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/audit-logs
// ─────────────────────────────────────────────────────
const getAuditLogs = async (req, res) => {
  const { skip, take, page, limit } = getPagination(req.query);
  
  const where = buildAuditWhere(req.query);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
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
            staff: { select: { firstName: true, lastName: true } },
          }
        },
        school: { select: { id: true, name: true } }
      }
    }),
    prisma.auditLog.count({ where })
  ]);

  return sendSuccess(res, 200, 'Audit logs fetched', paginatedResponse(logs, total, page, limit));
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/audit-logs/:id
// ─────────────────────────────────────────────────────
const getAuditLogById = async (req, res) => {
  const log = await prisma.auditLog.findUnique({
    where: { id: req.params.id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          staff: { select: { firstName: true, lastName: true } },
        }
      },
      school: { select: { id: true, name: true } }
    }
  });

  if (!log) throw createError('Audit log not found', 404);
  return sendSuccess(res, 200, 'Audit log fetched', log);
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/audit-logs/export
// ─────────────────────────────────────────────────────
const exportAuditLogs = async (req, res) => {
  const { format = 'csv' } = req.query;
  const where = buildAuditWhere(req.query);

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, role: true } },
      school: { select: { name: true } }
    }
  });

  const data = logs.map(log => ({
    ID: log.id,
    User: log.user?.email || 'System',
    Role: log.user?.role || 'SYSTEM',
    School: log.school?.name || 'Platform',
    Action: log.action,
    Resource: log.resource,
    ResourceId: log.resourceId || '-',
    IP: log.ipAddress || '-',
    Timestamp: log.createdAt.toISOString(),
  }));

  if (format === 'json') {
    return sendSuccess(res, 200, 'Audit logs exported', data);
  }

  // CSV
  const headers = Object.keys(data[0] || {});
  const csvRows = [
    headers.join(','),
    ...data.map(row => 
      headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',')
    )
  ];

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
  return res.send(csvRows.join('\n'));
};

// ─────────────────────────────────────────────────────
// GET /api/v1/admin/audit-logs/stats
// ─────────────────────────────────────────────────────
const getAuditStats = async (req, res) => {
  const [total, actions, resources, today] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.groupBy({ by: ['action'], _count: { id: true } }),
    prisma.auditLog.groupBy({ by: ['resource'], _count: { id: true } }),
    prisma.auditLog.count({
      where: {
        createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }
    })
  ]);

  return sendSuccess(res, 200, 'Audit stats fetched', {
    total,
    today,
    actions: actions.map(a => ({ action: a.action, count: a._count.id })),
    resources: resources.map(r => ({ resource: r.resource, count: r._count.id })),
  });
};

module.exports = {
  getAuditLogs,
  getAuditLogById,
  exportAuditLogs,
  getAuditStats,
};