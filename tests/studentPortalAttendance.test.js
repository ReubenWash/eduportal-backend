const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../src/config/db');
const servicePath = require.resolve('../src/services/student.service');
const originalDb = require.cache[dbPath];
const originalService = require.cache[servicePath];
const attendanceRows = [
  { id: 'att-1', studentId: 'student-1', status: 'PRESENT', date: new Date('2026-10-02T00:00:00Z') },
  { id: 'att-2', studentId: 'student-1', status: 'ABSENT', date: new Date('2026-10-01T00:00:00Z') },
  { id: 'att-3', studentId: 'student-1', status: 'LATE', date: new Date('2026-09-30T00:00:00Z') },
  { id: 'att-4', studentId: 'student-1', status: 'PRESENT', date: new Date('2026-09-29T00:00:00Z') },
];
let attendanceQuery;

require.cache[dbPath] = {
  exports: {
    prisma: {
      attendance: {
        findMany: async (query) => {
          attendanceQuery = query;
          return attendanceRows;
        },
      },
    },
  },
};
delete require.cache[servicePath];
const studentService = require('../src/services/student.service');

test('student portal attendance returns only the requested student and parent-compatible summary shape', async () => {
  const result = await studentService.getStudentAttendance('student-1');

  assert.deepEqual(attendanceQuery.where, { studentId: 'student-1' });
  assert.deepEqual(result.summary, { present: 2, absent: 1, late: 1, total: 4 });
  assert.equal(result.records.length, 4);
  assert.deepEqual(result.records.map(record => record.status), ['PRESENT', 'ABSENT', 'LATE', 'PRESENT']);
});

test.after(() => {
  if (originalService) require.cache[servicePath] = originalService;
  else delete require.cache[servicePath];
  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
});
