const test = require('node:test');
const assert = require('node:assert/strict');

const { isSupportedPortal, isRoleAllowedForPortal } = require('../src/utils/authPortal');

test('each portal accepts only its assigned roles', () => {
  assert.equal(isRoleAllowedForPortal('school-administration', 'SCHOOL_ADMIN'), true);
  assert.equal(isRoleAllowedForPortal('school-administration', 'ACCOUNTANT'), true);
  assert.equal(isRoleAllowedForPortal('school-administration', 'SUPER_ADMIN'), true);
  assert.equal(isRoleAllowedForPortal('school-administration', 'CLASS_TEACHER'), false);

  assert.equal(isRoleAllowedForPortal('teaching-staff', 'CLASS_TEACHER'), true);
  assert.equal(isRoleAllowedForPortal('teaching-staff', 'SUBJECT_TEACHER'), true);
  assert.equal(isRoleAllowedForPortal('teaching-staff', 'SCHOOL_ADMIN'), false);

  assert.equal(isRoleAllowedForPortal('parents-guardians', 'PARENT'), true);
  assert.equal(isRoleAllowedForPortal('parents-guardians', 'STUDENT'), false);
  assert.equal(isRoleAllowedForPortal('students', 'STUDENT'), true);
  assert.equal(isRoleAllowedForPortal('students', 'PARENT'), false);
});

test('unknown portals are rejected', () => {
  assert.equal(isSupportedPortal('students'), true);
  assert.equal(isSupportedPortal('unknown'), false);
  assert.equal(isRoleAllowedForPortal('unknown', 'STUDENT'), false);
  assert.equal(isRoleAllowedForPortal(undefined, 'STUDENT'), false);
});
