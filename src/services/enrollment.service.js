const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

const enroll = async (schoolId, { studentId, classId, termId }) => {
  // Validate required fields
  if (!studentId || !classId || !termId) {
    throw createError("studentId, classId, and termId are required", 400);
  }

  // Check if student exists and belongs to school
  const s = await prisma.student.findFirst({ 
    where: { id: studentId, schoolId } 
  });
  
  if (!s) {
    throw createError("Student not found in this school", 404);
  }

  // Check if class exists and belongs to school
  const c = await prisma.class.findFirst({ 
    where: { id: classId, schoolId } 
  });
  
  if (!c) {
    throw createError("Class not found in this school", 404);
  }

  // Check if term exists and belongs to school
  const t = await prisma.term.findFirst({ 
    where: { id: termId, schoolId } 
  });
  
  if (!t) {
    throw createError("Term not found in this school", 404);
  }

  // Create or update enrollment using upsert
  const enrollment = await prisma.enrollment.upsert({
    where: { 
      studentId_termId: { studentId, termId } 
    },
    create: { 
      studentId, 
      classId, 
      termId 
    },
    update: { 
      classId 
    },
  });

  return enrollment;
};

const bulkEnroll = async (schoolId, { studentIds, classId, termId }) => {
  if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
    throw createError("studentIds array is required", 400);
  }

  if (!classId || !termId) {
    throw createError("classId and termId are required", 400);
  }

  let enrolled = 0, skipped = 0;
  const errors = [];

  for (const studentId of studentIds) {
    try {
      await enroll(schoolId, { studentId, classId, termId });
      enrolled++;
    } catch (err) {
      skipped++;
      errors.push({ studentId, error: err.message });
    }
  }
  
  return { enrolled, skipped, errors };
};

const getEnrollments = async (schoolId, query) => {
  const where = { student: { schoolId } };
  if (query.classId)   where.classId   = query.classId;
  if (query.termId)    where.termId    = query.termId;
  if (query.studentId) where.studentId = query.studentId;
  
  return prisma.enrollment.findMany({
    where,
    include: {
      student: { 
        select: { 
          id: true,
          firstName: true, 
          lastName: true, 
          studentNumber: true,
          photoUrl: true
        } 
      },
      class: { 
        select: { 
          id: true,
          level: true, 
          section: true 
        } 
      },
      term: { 
        select: { 
          id: true,
          academicYear: true, 
          termNumber: true 
        } 
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

const removeEnrollment = async (schoolId, enrollmentId) => {
  const e = await prisma.enrollment.findFirst({ 
    where: { 
      id: enrollmentId, 
      student: { schoolId } 
    } 
  });
  
  if (!e) {
    throw createError("Enrollment not found.", 404);
  }
  
  // Check if scores exist for this student in this term
  const hasScores = await prisma.score.count({ 
    where: { 
      studentId: e.studentId, 
      termId: e.termId 
    } 
  });
  
  if (hasScores > 0) {
    throw createError("Cannot remove enrollment with submitted scores.", 400);
  }
  
  await prisma.enrollment.delete({ 
    where: { id: enrollmentId } 
  });
  
  return { success: true };
};

// ─── Get enrollment by student and term ───
const getEnrollmentByStudentTerm = async (schoolId, studentId, termId) => {
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId,
      termId,
      student: { schoolId }
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          studentNumber: true
        }
      },
      class: {
        select: {
          id: true,
          level: true,
          section: true
        }
      },
      term: {
        select: {
          id: true,
          academicYear: true,
          termNumber: true
        }
      }
    }
  });

  return enrollment;
};

module.exports = { 
  enroll, 
  bulkEnroll, 
  getEnrollments, 
  removeEnrollment,
  getEnrollmentByStudentTerm
};