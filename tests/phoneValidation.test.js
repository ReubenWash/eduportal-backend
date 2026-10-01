const test = require('node:test');
const assert = require('node:assert/strict');
const { isValidE164Phone } = require('../src/utils/phone');
const { parsePhone } = require('../src/utils/studentImport');

test('E.164 validation requires a plus sign, country code, and 8-15 digits', () => {
  assert.equal(isValidE164Phone('+233240000000'), true);
  assert.equal(isValidE164Phone('+447911123456'), true);
  assert.equal(isValidE164Phone('0240000000'), false);
  assert.equal(isValidE164Phone('+02340000000'), false);
  assert.equal(isValidE164Phone('+1234567'), false);
});

test('student import normalizes Ghana phone numbers to E.164', () => {
  assert.deepEqual(parsePhone('024 000 0000'), { value: '+233240000000', warning: null });
  assert.deepEqual(parsePhone('240000000'), { value: '+233240000000', warning: null });
  assert.deepEqual(parsePhone('+233 24 000 0000'), { value: '+233240000000', warning: null });
  assert.deepEqual(parsePhone('+447911123456'), { value: '+447911123456', warning: null });
  assert.match(parsePhone('not a phone').warning, /10-digit Ghana number/);
});
