const { prisma }   = require("../config/db");
const { generateStudentNumber } = require("../utils/generateId");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");

const admitStudent = async (schoolId, data, photoUrl) => {
  const studentNumber = await generateStudentNumber(schoolId);

  const student = await prisma.student.create({
    data: {
      schoolId,
      studentNumber,
      firstName:    data.firstName,
      lastName:     data.lastName,
      otherNames:   data.otherNames || null,
      gender:       data.gender,
      dateOfBirth:  new Date(data.dateOfBirth),
      photoUrl:     photoUrl || null,
      admissionDate: new Date(),
    },
  });

  // Link primary guardian
  if (data.guardianId) {
    await prisma.studentGuardian.create({
      data: { studentId: student.id, guardianId: data.guardianId, isPrimary: true },
    });
  }

  // Enroll in class for active term
  const activeTerm = await prisma.term.findFirst({
    where: { schoolId, status: "ACTIVE" },
  });

  if (activeTerm && data.classId) {
    await prisma.enrollment.create({
      data: { studentId: student.id, classId: data.classId, termId: activeTerm.id },
    });
  }

  return student;
};

const getStudents = async (schoolId, query) => {
  const { skip, take, page, limit } = getPagination(query);

  const where = { schoolId };
  if (query.status)  where.status  = query.status;
  if (query.search) {
    where.OR = [
      { firstName:     { contains: query.search, mode: "insensitive" } },
      { lastName:      { contains: query.search, mode: "insensitive" } },
      { studentNumber: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.classId) {
    where.enrollments = { some: { classId: query.classId } };
  }
  if (query.level) {
    where.enrollments = { some: { class: { level: query.level } } };
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where, skip, take,
      orderBy: { firstName: "asc" },
      select: {
        id: true, studentNumber: true, firstName: true, lastName: true,
        gender: true, dateOfBirth: true, photoUrl: true, status: true,
        admissionDate: true,
        enrollments: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            class: { select: { level: true, section: true } },
          },
        },
      },
    }),
    prisma.student.count({ where }),
  ]);

  return paginatedResponse(students, total, page, limit);
};

const getStudentById = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      guardians: {
        include: { guardian: true },
      },
      enrollments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          class:  { select: { level: true, section: true, classTeacher: { select: { firstName: true, lastName: true } } } },
          term:   { select: { academicYear: true, termNumber: true, status: true } },
        },
      },
      scores: {
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { subject: { select: { name: true, code: true } } },
      },
    },
  });

  if (!student) throw createError("Student not found.", 404);
  return student;
};

const updateStudent = async (schoolId, studentId, data, photoUrl) => {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);

  const updateData = { ...data };
  if (data.dateOfBirth) updateData.dateOfBirth = new Date(data.dateOfBirth);
  if (photoUrl) updateData.photoUrl = photoUrl;

  return prisma.student.update({ where: { id: studentId }, data: updateData });
};

const withdrawStudent = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);
  return prisma.student.update({ where: { id: studentId }, data: { status: "WITHDRAWN" } });
};

const transferStudent = async (schoolId, studentId, destinationSchool) => {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);
  return prisma.student.update({
    where: { id: studentId },
    data: { status: "TRANSFERRED" },
  });
};

const getStudentReports = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);

  return prisma.report.findMany({
    where:   { studentId },
    orderBy: { createdAt: "desc" },
    include: {
      term: { select: { academicYear: true, termNumber: true } },
    },
  });
};

const getStudentTranscript = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: {
      id: true, studentNumber: true, firstName: true, lastName: true,
      gender: true, dateOfBirth: true, photoUrl: true,
    },
  });
  if (!student) throw createError("Student not found.", 404);

  const terms = await prisma.term.findMany({
    where:   { schoolId },
    orderBy: [{ academicYear: "asc" }, { termNumber: "asc" }],
    select:  { id: true, academicYear: true, termNumber: true },
  });

  const transcript = await Promise.all(
    terms.map(async (term) => {
      const scores = await prisma.score.findMany({
        where:   { studentId, termId: term.id },
        include: { subject: { select: { name: true, code: true } } },
      });

      const report = await prisma.report.findFirst({
        where:  { studentId, termId: term.id },
        select: { classPosition: true, totalStudents: true, aggregate: true, daysPresent: true, daysAbsent: true },
      });

      return { term, scores, report };
    })
  );

  return { student, transcript: transcript.filter((t) => t.scores.length > 0) };
};

const bulkImportStudents = async (schoolId, records) => {
  let created = 0, skipped = 0;
  const failed = [];

  for (const row of records) {
    try {
      if (!row.firstName || !row.lastName || !row.gender || !row.dateOfBirth) {
        skipped++;
        continue;
      }
      await admitStudent(schoolId, row, null);
      created++;
    } catch (err) {
      failed.push({ row, error: err.message });
    }
  }

  return { created, skipped, failed };
};

module.exports = {
  admitStudent,
  getStudents,
  getStudentById,
  updateStudent,
  withdrawStudent,
  transferStudent,
  getStudentReports,
  getStudentTranscript,
  bulkImportStudents,
};
