const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const controllerPath = require.resolve('../src/controllers/student.controller');
const servicePath = require.resolve('../src/services/student.service');
const dbPath = require.resolve('../src/config/db');
const uploadPath = require.resolve('../src/middleware/upload');
const excelPath = require.resolve('../src/utils/excel');
const paths = [controllerPath, servicePath, dbPath, uploadPath, excelPath];
const originalCache = new Map(paths.map(file => [file, require.cache[file]]));
let reportArgs;

const mockModule = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

mockModule(dbPath, { prisma: {} });
mockModule(servicePath, {
  getStudentByUserId: async (userId, schoolId) => ({ id: 'student-1', userId, schoolId }),
  getStudentReports: async (...args) => {
    reportArgs = args;
    return [{ id: 'report-1', status: 'RELEASED' }];
  },
});
mockModule(uploadPath, { uploadStudentPhoto: () => {} });
mockModule(excelPath, { parseExcelBuffer: () => {}, generateExcelBuffer: () => {}, sendExcelFile: () => {} });
const controller = require('../src/controllers/student.controller');

test('student self-service report cards query includes authenticated school and student IDs', async () => {
  const result = {};
  const res = {
    status(code) { result.statusCode = code; return this; },
    json(body) { result.body = body; return this; },
  };

  await controller.getMyReportCards({ user: { userId: 'user-1', schoolId: 'school-1' } }, res);

  assert.deepEqual(reportArgs, ['school-1', 'student-1']);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.body.data, [{ id: 'report-1', status: 'RELEASED' }]);
});

test.after(() => {
  delete require.cache[controllerPath];
  for (const [file, cached] of originalCache) {
    if (cached) require.cache[file] = cached;
    else delete require.cache[file];
  }
});
