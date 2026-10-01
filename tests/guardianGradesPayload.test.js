const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeGuardianGradePayload } = require('../src/utils/guardianGradePayload');

test('guardian grade payload groups raw score rows by term and exposes term labels', () => {
  const records = [
    {
      id: 's1',
      subjectId: 'sub1',
      subject: { name: 'Math', code: 'MTH', type: 'CORE' },
      term: { id: 't1', academicYear: '2025/2026', termNumber: 'TERM1' },
      ca1: 8,
      ca2: 9,
      ca3: 7,
      examScore: 80,
      total: 82,
      grade: 'B2',
    },
    {
      id: 's2',
      subjectId: 'sub2',
      subject: { name: 'Science', code: 'SCI', type: 'CORE' },
      term: { id: 't1', academicYear: '2025/2026', termNumber: 'TERM1' },
      ca1: 7,
      ca2: 8,
      ca3: 9,
      examScore: 75,
      total: 79,
      grade: 'B3',
    },
  ];

  const result = normalizeGuardianGradePayload(records);

  assert.equal(result.length, 1);
  assert.equal(result[0].term.termLabel, '2025/2026 - Term 1');
  assert.equal(result[0].subjects.length, 2);
  assert.equal(result[0].subjects[0].subjectName, 'Math');
  assert.equal(result[0].average, 81);
});
