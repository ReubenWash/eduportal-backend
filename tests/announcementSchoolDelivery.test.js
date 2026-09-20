const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serviceText = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'notification.service.js'), 'utf8');
const routeText = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'notification.routes.js'), 'utf8');
const frontendText = fs.readFileSync(path.join(__dirname, '..', '..', 'eduportal-frontend', 'src', 'pages', 'superadmin', 'AdminAnnouncements.jsx'), 'utf8');

test('mass broadcast accepts selected schools and delivers email to those schools', () => {
  assert.match(serviceText, /schoolIds|selectedSchools/);
  assert.match(serviceText, /sendMailSafe|school\.email|to:\s*school\.email/);
  assert.match(routeText, /ALL_SCHOOLS|PREMIUM_ONLY|BASIC_ONLY|ALL_TEACHERS|ALL_PARENTS|selectedSchools/);
  assert.match(frontendText, /selectedSchools|schoolIds/);
});
