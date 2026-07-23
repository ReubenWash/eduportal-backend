const { prisma } = require("../config/db");

/**
 * Generate a unique student number in the format: JHS-YYYY-NNNN
 * e.g.  JHS-2025-0042
 * Scoped per school so numbers reset per school.
 */
const generateStudentNumber = async (schoolId) => {
  const year = new Date().getFullYear();
  const prefix = `JHS-${year}-`;

  // Count existing students for this school this year to get next sequence
  const count = await prisma.student.count({
    where: {
      schoolId,
      studentNumber: { startsWith: prefix },
    },
  });

  const sequence = String(count + 1).padStart(4, "0");
  return `${prefix}${sequence}`;
};

/**
 * Generate a unique staff number in the format: STF-YYYY-NNNN
 * e.g.  STF-2025-0010
 */
const generateStaffNumber = async (schoolId) => {
  const year = new Date().getFullYear();
  const prefix = `STF-${year}-`;

  const count = await prisma.staff.count({
    where: {
      schoolId,
      staffNumber: { startsWith: prefix },
    },
  });

  const sequence = String(count + 1).padStart(4, "0");
  return `${prefix}${sequence}`;
};

/**
 * Generate a URL-friendly slug from a school name
 * e.g. "Accra Academy JHS" → "accra-academy-jhs"
 * Appends a short random suffix to ensure uniqueness
 */
const generateSchoolSlug = (name) => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")   // remove special chars
    .trim()
    .replace(/\s+/g, "-");            // spaces → hyphens

  const suffix = Math.random().toString(36).substring(2, 6); // 4-char random
  return `${base}-${suffix}`;
};

module.exports = {
  generateStudentNumber,
  generateStaffNumber,
  generateSchoolSlug,
};
