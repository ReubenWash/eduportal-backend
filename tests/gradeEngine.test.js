const test = require('node:test');
const assert = require('node:assert/strict');

const { computeScore, computeAggregate } = require('../src/utils/gradeEngine');

test('default grade engine returns A1-F9 style grades for totals and aggregates', () => {
  const perfect = computeScore({ ca1: 10, ca2: 10, ca3: 10, examScore: 100 });
  assert.equal(perfect.grade, 'A1');
  assert.equal(perfect.total, 100);

  const strong = computeScore({ ca1: 8, ca2: 8, ca3: 8, examScore: 80 });
  assert.equal(strong.grade, 'B2');

  const failing = computeScore({ ca1: 0, ca2: 0, ca3: 0, examScore: 0 });
  assert.equal(failing.grade, 'F9');

  assert.equal(computeAggregate(['A1', 'B2', 'C4']), 7);
});
