const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const enroll = async (schoolId, { studentId, classId, termId }) => {
  const s = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!s) throw createError("Student not found.", 404);
  return prisma.enrollment.upsert({
    where:  { studentId_termId: { studentId, termId } },
    create: { studentId, classId, termId },
    update: { classId },
  });
};

const bulkEnroll = async (schoolId, { studentIds, classId, termId }) => {
  let enrolled = 0, skipped = 0;
  for (const studentId of studentIds) {
    try {
      await enroll(schoolId, { studentId, classId, termId });
      enrolled++;
    } catch { skipped++; }
  }
  return { enrolled, skipped };
};

const getEnrollments = async (schoolId, query) => {
  const where = { student: { schoolId } };
  if (query.classId)   where.classId   = query.classId;
  if (query.termId)    where.termId    = query.termId;
  if (query.studentId) where.studentId = query.studentId;
  return prisma.enrollment.findMany({
    where,
    include: {
      student: { select: { firstName: true, lastName: true, studentNumber: true } },
      class:   { select: { level: true, section: true } },
      term:    { select: { academicYear: true, termNumber: true } },
    },
  });
};

const removeEnrollment = async (schoolId, enrollmentId) => {
  const e = await prisma.enrollment.findFirst({ where: { id: enrollmentId, student: { schoolId } } });
  if (!e) throw createError("Enrollment not found.", 404);
  const hasScores = await prisma.score.count({ where: { studentId: e.studentId, termId: e.termId } });
  if (hasScores > 0) throw createError("Cannot remove enrollment with submitted scores.", 400);
  await prisma.enrollment.delete({ where: { id: enrollmentId } });
};

module.exports = { enroll, bulkEnroll, getEnrollments, removeEnrollment };
