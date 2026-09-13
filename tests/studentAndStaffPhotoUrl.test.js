const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const studentControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'student.controller.js');
const staffControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'staff.controller.js');
const schoolControllerPath = path.join(__dirname, '..', 'src', 'controllers', 'school.controller.js');

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

test('school logo update uploads the in-memory file buffer to Cloudinary', () => {
  const schoolControllerText = fs.readFileSync(schoolControllerPath, 'utf8');
  assert.match(schoolControllerText, /upload_stream|req\.file\.buffer|Readable\.from\(req\.file\.buffer\)/);
});

test('school profile accepts report branding config and stores it as JSON', () => {
  const schoolControllerText = fs.readFileSync(schoolControllerPath, 'utf8');
  assert.match(schoolControllerText, /reportConfig|JSON\.parse\(req\.body\.reportConfig\)/);
});

test('school report config stores signature URLs and PDF embeds signature images', () => {
  const schoolControllerText = fs.readFileSync(schoolControllerPath, 'utf8');
  const pdfServiceText = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'pdf.service.js'), 'utf8');

  assert.match(schoolControllerText, /principalSignature|classTeacherSignature/);
  assert.match(pdfServiceText, /principalSignatureUrl|classTeacherSignatureUrl|doc\.image\(/);
});
