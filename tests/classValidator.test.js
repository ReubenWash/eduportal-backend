const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { createClassValidator, updateClassValidator } = require('../src/validators/class.validator');

const validateBody = async (validators, body) => {
  const req = { body, params: {} };
  for (const validator of validators) await validator.run(req);
  return validationResult(req).array().map(error => ({ field: error.path, message: error.msg }));
};

test('class creation accepts early years, primary, secondary, and custom class levels', async () => {
  for (const level of ['Creche', 'Nursery 2', 'Kindergarten', 'Primary 1', 'JHS 3', 'SHS 1', 'Adult Literacy']) {
    const errors = await validateBody(createClassValidator, {
      level,
      section: 'Blue Room',
      academicYear: '2026/2027',
    });
    assert.deepEqual(errors, [], `${level} should be accepted`);
  }
});

test('class creation rejects blank/overlong level, blank section, and invalid academic year', async () => {
  const blankErrors = await validateBody(createClassValidator, {
    level: '   ', section: '', academicYear: '',
  });
  assert.deepEqual(blankErrors.map(error => error.field), ['level', 'section', 'academicYear']);

  const longErrors = await validateBody(createClassValidator, {
    level: 'x'.repeat(41), section: 'A', academicYear: '2026-2027',
  });
  assert.deepEqual(longErrors.map(error => error.field), ['level', 'academicYear']);
});

test('class updates allow omitted labels but validate supplied custom levels', async () => {
  assert.deepEqual(await validateBody(updateClassValidator, { section: 'Room 2' }), []);
  assert.deepEqual(await validateBody(updateClassValidator, { level: 'Nursery 1' }), []);
  const errors = await validateBody(updateClassValidator, { level: '  ', academicYear: '2026-27' });
  assert.deepEqual(errors.map(error => error.field), ['level', 'academicYear']);
});
