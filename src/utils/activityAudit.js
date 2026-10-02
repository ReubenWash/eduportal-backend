const RESOURCE_BY_ROUTE = {
  auth: 'USER',
  schools: 'SCHOOL',
  staff: 'STAFF',
  students: 'STUDENT',
  guardians: 'GUARDIAN',
  classes: 'CLASS',
  subjects: 'SUBJECT',
  terms: 'TERM',
  enrollments: 'ENROLLMENT',
  scores: 'SCORE',
  attendance: 'ATTENDANCE',
  reports: 'REPORT',
  notifications: 'NOTIFICATION',
  documents: 'DOCUMENT',
  upload: 'DOCUMENT',
};

const STAFF_ROLES = new Set(['SCHOOL_ADMIN', 'CLASS_TEACHER', 'SUBJECT_TEACHER']);

const buildActivityAuditData = (req, statusCode) => {
  if (statusCode < 200 || statusCode >= 400) return null;
  if (!STAFF_ROLES.has(req.user?.role) || req.originalUrl.includes('/activity-logs')) return null;

  const method = String(req.method || 'GET').toUpperCase();
  const path = req.originalUrl.split('?')[0];
  const action = /\/export(?:\/|$)/i.test(path)
    ? 'EXPORT'
    : /\/import(?:-|\/|$)/i.test(path) || /\/bulk-import(?:\/|$)/i.test(path)
      ? 'IMPORT'
      : method === 'GET' || method === 'HEAD'
        ? 'VIEW'
        : method === 'DELETE' ? 'DELETE' : method === 'POST' ? 'CREATE' : 'UPDATE';
  const routeName = path.split('/').filter(Boolean)[2] || 'system';
  const ipAddress = req.ip || null;

  return {
    userId: req.user.userId || req.user.id,
    schoolId: req.user.schoolId,
    action,
    resource: RESOURCE_BY_ROUTE[routeName] || 'SYSTEM_SETTING',
    resourceId: req.params?.id || req.params?.studentId || null,
    ipAddress,
    userAgent: req.get?.('user-agent') || req.headers?.['user-agent'] || null,
    metadata: {
      method,
      route: path,
      statusCode,
      bodyFields: req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 50) : [],
      queryFields: req.query && typeof req.query === 'object' ? Object.keys(req.query).slice(0, 50) : [],
    },
  };
};

module.exports = { buildActivityAuditData };
