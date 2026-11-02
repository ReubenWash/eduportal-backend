const test = require('node:test');
const assert = require('node:assert/strict');
const { applyEmailLayout } = require('../src/utils/emailLayout');

test('email layout wraps template content in the shared responsive branded frame', () => {
  const result = applyEmailLayout('<h1>Welcome</h1><p>Your account is ready.</p>');

  assert.match(result, /<!doctype html>/i);
  assert.match(result, /name="viewport"/);
  assert.match(result, /max-width:640px/);
  assert.match(result, /<h1>Welcome<\/h1>/);
  assert.match(result, /EduTrack JHS/);
});

test('email layout does not wrap content that already has the shared frame', () => {
  const wrapped = applyEmailLayout('<p>First message</p>');

  assert.equal(applyEmailLayout(wrapped), wrapped);
});
