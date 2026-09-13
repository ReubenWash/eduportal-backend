const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicePath = path.join(__dirname, '..', 'src', 'services', 'student.service.js');
const source = fs.readFileSync(servicePath, 'utf8');

test('student admission checks the Guardian relation using the actual User model field name', () => {
  const userLookupBlock = source.match(/const existingUser = await tx\.user\.findUnique\([\s\S]*?\}\);/);

  assert.ok(userLookupBlock, 'Expected a tx.user.findUnique lookup for guardian matching');
  assert.match(userLookupBlock[0], /guardianProfile:\s*true/);
  assert.doesNotMatch(userLookupBlock[0], /guardian:\s*true/);
});
