const { prisma } = require('../config/db');
const { sendSuccess } = require('../utils/apiResponse');
const { getPagination, paginatedResponse } = require('../utils/paginate');

const getActivityLogs = async (req, res) => {
  const { skip, take, page, limit } = getPagination(req.query);
  const where = { schoolId: req.user.schoolId };

  if (req.query.action) where.action = req.query.action;
  if (req.query.resource) where.resource = req.query.resource;
  if (req.query.userId) where.userId = req.query.userId;
  if (req.query.from || req.query.to) {
    where.createdAt = {};
    if (req.query.from) where.createdAt.gte = new Date(req.query.from);
    if (req.query.to) where.createdAt.lte = new Date(req.query.to);
  }
  if (req.query.search) {
    where.OR = [
      { resourceId: { contains: req.query.search, mode: 'insensitive' } },
      { user: { email: { contains: req.query.search, mode: 'insensitive' } } },
      { user: { staff: { firstName: { contains: req.query.search, mode: 'insensitive' } } } },
      { user: { staff: { lastName: { contains: req.query.search, mode: 'insensitive' } } } },
      { metadata: { path: ['route'], string_contains: req.query.search } },
    ];
  }

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
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return sendSuccess(res, 200, 'School activity logs fetched', paginatedResponse(logs, total, page, limit));
};

module.exports = { getActivityLogs };
