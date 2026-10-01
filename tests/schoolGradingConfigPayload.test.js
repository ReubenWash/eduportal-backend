const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeSchoolUpdatePayload } = require('../src/utils/schoolPayload');

test('normalizeSchoolUpdatePayload preserves gradingConfig JSON and objects', () => {
  const payload = normalizeSchoolUpdatePayload({
    scoreLabels: '{"ca1":"CA 1"}',
    reportConfig: '{"title":"Term Test"}',
    gradingConfig: '{"caCount":4,"examMaxScore":60}'
  });

  assert.deepEqual(payload.scoreLabels, { ca1: 'CA 1' });
  assert.deepEqual(payload.reportConfig, { title: 'Term Test' });
  assert.deepEqual(payload.gradingConfig, { caCount: 4, examMaxScore: 60 });

  const objectPayload = normalizeSchoolUpdatePayload({
    gradingConfig: { caCount: 5, boundaries: { A1: 90 } }
  });

  assert.deepEqual(objectPayload.gradingConfig, { caCount: 5, boundaries: { A1: 90 } });
});
