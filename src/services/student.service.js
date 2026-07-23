const bcrypt = require("bcryptjs");
const { prisma }   = require("../config/db");
const { generateStudentNumber } = require("../utils/generateId");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");

const admitStudent = async (schoolId, data, photoUrl) => {
  const studentNumber = await generateStudentNumber(schoolId);

  // Standard temporary password for students
  const tempPassword = "password123";
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const student = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        schoolId,
        email: `${studentNumber}@student.internal`.toLowerCase(),
        passwordHash,
        role: "STUDENT",
        isVerified: true,
        mustChangePassword: true,
      },
    });

    const newStudent = await tx.student.create({
      data: {
        schoolId,
        userId:       user.id,
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
      await tx.studentGuardian.create({
        data: { studentId: newStudent.id, guardianId: data.guardianId, isPrimary: true },
      });
    }

    // Enroll in class for active term
    const activeTerm = await tx.term.findFirst({
      where: { schoolId, status: "ACTIVE" },
    });

    if (activeTerm && data.classId) {
      await tx.enrollment.create({
        data: { studentId: newStudent.id, classId: data.classId, termId: activeTerm.id },
      });
    }

    return newStudent;
  });

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

// ═══ NEW FUNCTIONS (appended) ═══

const bulkImportStudentsFromExcelRows = async (schoolId, rows) => {
  const records = rows.map((r) => ({
    firstName: String(r.firstName || "").trim(),
    lastName: String(r.lastName || "").trim(),
    otherNames: r.otherNames ? String(r.otherNames).trim() : null,
    gender: String(r.gender || "").trim().toUpperCase(),
    dateOfBirth: r.dateOfBirth instanceof Date ? r.dateOfBirth.toISOString() : String(r.dateOfBirth || ""),
    classId: r.classId ? String(r.classId).trim() : null,
    guardianId: r.guardianId ? String(r.guardianId).trim() : null,
  }));

  // Reuses bulkImportStudents() already defined in this file, which in
  // turn calls admitStudent() — so each imported row still gets a proper
  // User + login account created exactly like a single manual admission.
  return bulkImportStudents(schoolId, records);
};

const getStudentsForExport = async (schoolId, query) => {
  const where = { schoolId };
  if (query.status) where.status = query.status;
  if (query.classId) where.enrollments = { some: { classId: query.classId } };

  const students = await prisma.student.findMany({
    where,
    orderBy: { firstName: "asc" },
    select: {
      studentNumber: true, firstName: true, lastName: true, otherNames: true,
      gender: true, dateOfBirth: true, status: true, admissionDate: true,
      enrollments: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { class: { select: { level: true, section: true } } },
      },
    },
  });

  return students.map((s) => ({
    studentNumber: s.studentNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    otherNames: s.otherNames || "",
    gender: s.gender,
    dateOfBirth: s.dateOfBirth.toISOString().split("T")[0],
    class: s.enrollments[0] ? `${s.enrollments[0].class.level} ${s.enrollments[0].class.section}` : "",
    status: s.status,
    admissionDate: s.admissionDate.toISOString().split("T")[0],
  }));
};

// ═══ UPDATED EXPORTS (new functions added) ═══

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
  bulkImportStudentsFromExcelRows,   // NEW
  getStudentsForExport,              // NEW
};