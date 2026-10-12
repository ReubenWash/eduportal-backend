// src/utils/generateId.js
const { prisma } = require("../config/db");

const parseSequence = (value, prefix) => {
  if (!value || !value.startsWith(prefix)) return 0;
  const n = parseInt(value.slice(prefix.length), 10);
  return Number.isNaN(n) ? 0 : n;
};

const generateStudentNumber = async (schoolId) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { type: true },
  });

  const year = new Date().getFullYear();
  let typePrefix = "STU"; // default
  if (school?.type === "PRIMARY") typePrefix = "PRI";
  if (school?.type === "JHS") typePrefix = "JHS";
  if (school?.type === "SHS") typePrefix = "SHS";

  const prefix = `${typePrefix}-${year}-`;

  const latest = await prisma.student.findFirst({
    where: { schoolId, studentNumber: { startsWith: prefix } },
    orderBy: { studentNumber: "desc" },
    select: { studentNumber: true },
  });

  let seq = parseSequence(latest?.studentNumber, prefix) + 1;
  if (seq < 1) seq = 1;

  // The student NUMBER's prefix is school type + year only (e.g.
  // "JHS-2026-"), not the specific school — two different JHS schools in
  // the same year land on identical candidates, which is fine for the
  // number itself (it's only ever shown within its own school). But
  // User.email has a GLOBAL unique constraint, so the synthetic email
  // built from this candidate must include something school-specific, or
  // the second school's very first student collides with the first
  // school's and silently gets bumped to 0002 instead of 0001.
  const MAX_ATTEMPTS = 10000;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;
    const candidateEmail = buildStudentInternalEmail(candidate, schoolId);

    const clash = await prisma.user.findFirst({
      where: { email: candidateEmail },
      select: { id: true },
    });

    if (!clash) return candidate;
    seq += 1;
  }

  throw new Error(
    "Could not allocate a unique student number after many attempts."
  );
};

// Shared with student.service.js so the email actually saved at creation
// time always matches what this collision check looked for — embeds
// schoolId so two schools can never collide on the same student number,
// even though the human-facing number itself stays clean (type+year+seq).
const buildStudentInternalEmail = (studentNumber, schoolId) => {
  return `${studentNumber}-${schoolId}@student.internal`.toLowerCase();
};

const generateStaffNumber = async (schoolId) => {
  const year = new Date().getFullYear();
  const prefix = `STF-${year}-`;

  const latest = await prisma.staff.findFirst({
    where: { schoolId, staffNumber: { startsWith: prefix } },
    orderBy: { staffNumber: "desc" },
    select: { staffNumber: true },
  });

  let seq = parseSequence(latest?.staffNumber, prefix) + 1;
  if (seq < 1) seq = 1;

  const MAX_ATTEMPTS = 10000;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;
    const candidateEmail = `${candidate}@staff.internal`.toLowerCase();

    const clash = await prisma.user.findFirst({
      where: { email: candidateEmail },
      select: { id: true },
    });

    if (!clash) return candidate;
    seq += 1;
  }

  throw new Error(
    "Could not allocate a unique staff number after many attempts."
  );
};

const generateSchoolSlug = (name) => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
};

module.exports = {
  generateStudentNumber,
  generateStaffNumber,
  generateSchoolSlug,
  buildStudentInternalEmail,
};