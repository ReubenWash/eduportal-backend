const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');

const { loginValidator } = require('../src/validators/auth.validator');

const validateRequest = async (body) => {
  const req = { body };
  await Promise.all(loginValidator.map((validator) => validator.run(req)));
  return validationResult(req).array();
};

const validateLogin = async (email, portal = 'students') => validateRequest({
  email,
  password: 'temporary-password',
  portal,
});

test('login accepts generated JHS student numbers and legacy STU numbers', async () => {
  assert.deepEqual(await validateLogin('JHS-2026-0001'), []);
  assert.deepEqual(await validateLogin('jhs-2026-10000'), []);
  assert.deepEqual(await validateLogin('STU/2026/0001'), []);
});

test('login rejects unsupported identifier formats', async () => {
  const errors = await validateLogin('JHS-26-1');
  assert.equal(errors.length, 1);
});

test('login requires a supported portal', async () => {
  assert.deepEqual(await validateLogin('JHS-2026-0001', 'students'), []);
  assert.equal((await validateRequest({
    email: 'JHS-2026-0001',
    password: 'temporary-password',
  })).length, 1);
  assert.equal((await validateLogin('JHS-2026-0001', 'unknown')).length, 1);
});