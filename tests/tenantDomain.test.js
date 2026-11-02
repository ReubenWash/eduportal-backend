const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getTenantSlugFromOrigin,
  isAllowedTenantOrigin,
} = require('../src/utils/tenantDomain');

test('tenant slug is resolved only from a single school subdomain', () => {
  assert.equal(getTenantSlugFromOrigin('https://north-school.goreb.example', 'goreb.example'), 'north-school');
  assert.equal(getTenantSlugFromOrigin('https://goreb.example', 'goreb.example'), null);
  assert.equal(getTenantSlugFromOrigin('https://a.b.goreb.example', 'goreb.example'), null);
  assert.equal(getTenantSlugFromOrigin('https://other.example', 'goreb.example'), null);
});

test('tenant origin allow-list is limited to root-domain HTTPS origins in production', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    assert.equal(isAllowedTenantOrigin('https://goreb.example', 'goreb.example'), true);
    assert.equal(isAllowedTenantOrigin('https://north-school.goreb.example', 'goreb.example'), true);
    assert.equal(isAllowedTenantOrigin('https://a.b.goreb.example', 'goreb.example'), false);
    assert.equal(isAllowedTenantOrigin('http://north-school.goreb.example', 'goreb.example'), false);
    assert.equal(isAllowedTenantOrigin('https://goreb.example.attacker.invalid', 'goreb.example'), false);
  } finally {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});
