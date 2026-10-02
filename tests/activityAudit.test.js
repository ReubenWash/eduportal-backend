const test = require('node:test');
const assert = require('node:assert/strict');
const { buildActivityAuditData } = require('../src/utils/activityAudit');

const makeRequest = (overrides = {}) => ({
  method: 'PATCH',
  originalUrl: '/api/v1/students/student-123?include=class',
  user: { userId: 'user-1', schoolId: 'school-1', role: 'CLASS_TEACHER' },
  params: { id: 'student-123' },
  ip: '192.0.2.10',
  headers: { 'x-forwarded-for': '198.51.100.200', 'user-agent': 'test-agent' },
  body: { guardianPhone: '+233240000000', password: 'never-log-this' },
  query: { include: 'class' },
  ...overrides,
});

test('staff activity audit records tenant, actor, route and field names without submitted values', () => {
  const event = buildActivityAuditData(makeRequest(), 200);

  assert.equal(event.userId, 'user-1');
  assert.equal(event.schoolId, 'school-1');
  assert.equal(event.action, 'UPDATE');
  assert.equal(event.resource, 'STUDENT');
  assert.equal(event.resourceId, 'student-123');
  assert.equal(event.ipAddress, '192.0.2.10');
  assert.deepEqual(event.metadata.bodyFields, ['guardianPhone', 'password']);
  assert.deepEqual(event.metadata.queryFields, ['include']);
  assert.equal(JSON.stringify(event).includes('never-log-this'), false);
  assert.equal(JSON.stringify(event).includes('+233240000000'), false);
});

test('activity audit classifies reads and excludes unsuccessful or audit-log requests', () => {
  assert.equal(buildActivityAuditData(makeRequest({ method: 'GET' }), 200).action, 'VIEW');
  assert.equal(buildActivityAuditData(makeRequest({ method: 'GET', originalUrl: '/api/v1/staff/export' }), 200).action, 'EXPORT');
  assert.equal(buildActivityAuditData(makeRequest({ method: 'POST', originalUrl: '/api/v1/students/import-excel' }), 201).action, 'IMPORT');
  assert.equal(buildActivityAuditData(makeRequest(), 422), null);
  assert.equal(buildActivityAuditData(makeRequest({ originalUrl: '/api/v1/activity-logs' }), 200), null);
  assert.equal(buildActivityAuditData(makeRequest({ user: { role: 'PARENT' } }), 200), null);
});
