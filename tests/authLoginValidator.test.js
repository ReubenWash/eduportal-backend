const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');

const { loginValidator } = require('../src/validators/auth.validator');

const validateLogin = async (email) => {
  const req = { body: { email, password: 'temporary-password' } };
  await Promise.all(loginValidator.map((validator) => validator.run(req)));
  return validationResult(req).array();
};

test('login accepts generated JHS student numbers and legacy STU numbers', async () => {
  assert.deepEqual(await validateLogin('JHS-2026-0001'), []);
  assert.deepEqual(await validateLogin('jhs-2026-10000'), []);
  assert.deepEqual(await validateLogin('STU/2026/0001'), []);
});

test('login rejects unsupported identifier formats', async () => {
  const errors = await validateLogin('JHS-26-1');
  assert.equal(errors.length, 1);
});