// src/utils/generateId.js
const { prisma } = require("../config/db");

const parseSequence = (value, prefix) => {
  if (!value || !value.startsWith(prefix)) return 0;
  const n = parseInt(value.slice(prefix.length), 10);
  return Number.isNaN(n) ? 0 : n;
};

const generateStudentNumber = async (schoolId) => {
  const year = new Date().getFullYear();
  const prefix = `JHS-${year}-`;

  const latest = await prisma.student.findFirst({
    where: { schoolId, studentNumber: { startsWith: prefix } },
    orderBy: { studentNumber: "desc" },
    select: { studentNumber: true },
  });

  let seq = parseSequence(latest?.studentNumber, prefix) + 1;
  if (seq < 1) seq = 1;

  const MAX_ATTEMPTS = 10000;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const candidate = `${prefix}${String(seq).padStart(4, "0")}`;
    const candidateEmail = `${candidate}@student.internal`.toLowerCase();

    // findFirst — doesn't require email to be a unique key in Prisma schema
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
};