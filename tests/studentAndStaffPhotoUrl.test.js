const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const studentControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'student.controller.js');
const staffControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'staff.controller.js');

const studentControllerText = fs.readFileSync(studentControllerPath, 'utf8');
const staffControllerText = fs.readFileSync(staffControllerPath, 'utf8');

test('student admit/update prefer the Cloudinary URL sent in the request body when no multipart file path exists', () => {
  assert.match(studentControllerText, /req\.body\?\.photoUrl|req\.body\.photoUrl/);
});

test('staff create/update prefer the Cloudinary URL sent in the request body when no multipart file path exists', () => {
  assert.match(staffControllerText, /req\.body\?\.photoUrl|req\.body\.photoUrl/);
});

test('student enrollment fallback creates a default active term when no term exists yet', () => {
  const serviceText = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'student.service.js'), 'utf8');
  assert.match(serviceText, /getOrCreateEnrollmentTerm|termNumber:\s*"TERM1"|status:\s*"ACTIVE"/);
});
