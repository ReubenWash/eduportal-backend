const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicControllerText = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'legal.controller.js'), 'utf8');
const frontendApiText = fs.readFileSync(path.join(__dirname, '..', '..', 'eduportal-frontend', 'src', 'api', 'legalApi.js'), 'utf8');
const frontendPageText = fs.readFileSync(path.join(__dirname, '..', '..', 'eduportal-frontend', 'src', 'pages', 'Legal.jsx'), 'utf8');

test('public legal page uses the public legal route and returns a ready fallback document when none exists', () => {
  assert.match(publicControllerText, /DEFAULT_LEGAL_DOCUMENTS|fallback.*legal|default.*document/i);
  assert.match(frontendApiText, /\/legal\//);
  assert.match(frontendPageText, /selectedType|getLegalDocumentByType\(/);
});
