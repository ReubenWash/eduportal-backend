const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = require.resolve('../src/config/db');
const originalDb = require.cache[dbPath];

const mockPrisma = {
  attendance: {
    findMany: async (args) => args,
  },
};

require.cache[dbPath] = { exports: { prisma: mockPrisma } };

const attendanceService = require('../src/services/attendance.service');

test('attendance query filters by date and term so daily marking reads the correct records', async () => {
  const result = await attendanceService.getAttendance('school-1', {
    classId: 'class-1',
    termId: 'term-1',
    date: '2026-09-13',
  });

  assert.equal(result.where.classId, 'class-1');
  assert.equal(result.where.termId, 'term-1');
  assert.ok(result.where.date && result.where.date.gte && result.where.date.lte);
});

test.after(() => {
  if (originalDb) {
    require.cache[dbPath] = originalDb;
  } else {
    delete require.cache[dbPath];
  }
});
