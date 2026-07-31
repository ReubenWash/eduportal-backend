const bcrypt = require("bcryptjs");
const { prisma }   = require("../config/db");
const { generateStudentNumber } = require("../utils/generateId");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");

// ─── Admit Student ───
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

    // ─── FIX: Remove guardian fields from student data ───
    const { 
      classId, 
      guardianName, 
      guardianPhone, 
      guardianEmail, 
      relationship,
      ...studentData 
    } = data;

    const newStudent = await tx.student.create({
      data: {
        schoolId,
        userId: user.id,
        studentNumber,
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        otherNames: studentData.otherNames || null,
        gender: studentData.gender,
        dateOfBirth: new Date(studentData.dateOfBirth),
        photoUrl: photoUrl || null,
        admissionDate: new Date(),
        status: studentData.status || 'ACTIVE',
      },
    });

    // ─── Create Guardian if provided ───
    if (guardianName) {
      const [firstName, ...lastNameParts] = guardianName.split(' ');
      const lastName = lastNameParts.join(' ') || '';
      
      const guardian = await tx.guardian.create({
        data: {
          schoolId: schoolId,
          firstName: firstName,
          lastName: lastName,
          phone: guardianPhone || null,
          email: guardianEmail || null,
          relationship: relationship || 'Guardian',
        }
      });

      await tx.studentGuardian.create({
        data: { 
          studentId: newStudent.id, 
          guardianId: guardian.id, 
          isPrimary: true 
        },
      });
    }

    // Enroll in class for active term
    if (classId) {
      const activeTerm = await tx.term.findFirst({
        where: { schoolId, status: "ACTIVE" },
      });

      if (activeTerm) {
        await tx.enrollment.create({
          data: { studentId: newStudent.id, classId: classId, termId: activeTerm.id },
        });
      }
    }

    return newStudent;
  });

  return student;
};

// ─── Get Students ───
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

// ─── Get Student By ID ───
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

// ─── Update Student ───
const updateStudent = async (schoolId, studentId, data, photoUrl) => {
  const student = await prisma.student.findFirst({ 
    where: { id: studentId, schoolId } 
  });
  if (!student) throw createError("Student not found.", 404);

  // ─── FIX: Remove guardian fields from student data ───
  const { 
    classId, 
    guardianName, 
    guardianPhone, 
    guardianEmail, 
    relationship,
    ...studentData 
  } = data;
  
  // Prepare update data for student (only fields that exist in Student model)
  const updateData = { ...studentData };
  if (updateData.dateOfBirth) {
    updateData.dateOfBirth = new Date(updateData.dateOfBirth);
  }
  if (photoUrl) {
    updateData.photoUrl = photoUrl;
  }

  // Update the student
  const updatedStudent = await prisma.student.update({
    where: { id: studentId },
    data: updateData,
  });

  // ─── Update Guardian Information if provided ───
  if (guardianName || guardianPhone || guardianEmail || relationship) {
    // Find existing guardian for this student
    const existingGuardianLink = await prisma.studentGuardian.findFirst({
      where: { 
        studentId: studentId,
        isPrimary: true
      },
      include: { guardian: true }
    });

    if (existingGuardianLink) {
      // Update existing guardian
      const guardianData = {};
      if (guardianName) {
        const [firstName, ...lastNameParts] = guardianName.split(' ');
        guardianData.firstName = firstName;
        guardianData.lastName = lastNameParts.join(' ') || '';
      }
      if (guardianPhone) guardianData.phone = guardianPhone;
      if (guardianEmail) guardianData.email = guardianEmail;
      if (relationship) guardianData.relationship = relationship;

      await prisma.guardian.update({
        where: { id: existingGuardianLink.guardianId },
        data: guardianData,
      });
    } else if (guardianName) {
      // Create new guardian
      const [firstName, ...lastNameParts] = guardianName.split(' ');
      const lastName = lastNameParts.join(' ') || '';
      
      const newGuardian = await prisma.guardian.create({
        data: {
          schoolId: schoolId,
          firstName: firstName,
          lastName: lastName,
          phone: guardianPhone || null,
          email: guardianEmail || null,
          relationship: relationship || 'Guardian',
        }
      });

      // Link guardian to student
      await prisma.studentGuardian.create({
        data: {
          studentId: studentId,
          guardianId: newGuardian.id,
          isPrimary: true,
        }
      });
    }
  }

  // ─── Update Class Enrollment if classId provided ───
  if (classId) {
    const activeTerm = await prisma.term.findFirst({
      where: { schoolId, status: "ACTIVE" },
    });

    if (activeTerm) {
      const existingEnrollment = await prisma.enrollment.findFirst({
        where: {
          studentId: studentId,
          termId: activeTerm.id,
        },
      });

      if (existingEnrollment) {
        await prisma.enrollment.update({
          where: { id: existingEnrollment.id },
          data: { classId },
        });
      } else {
        await prisma.enrollment.create({
          data: {
            studentId: studentId,
            classId: classId,
            termId: activeTerm.id,
          },
        });
      }
    }
  }

  // Return the updated student with relations
  return prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: {
      guardians: {
        include: { guardian: true },
      },
      enrollments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          class: { select: { level: true, section: true } },
          term: { select: { academicYear: true, termNumber: true } },
        },
      },
    },
  });
};

// ─── Withdraw Student ───
const withdrawStudent = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);
  return prisma.student.update({ where: { id: studentId }, data: { status: "WITHDRAWN" } });
};

// ─── Transfer Student ───
const transferStudent = async (schoolId, studentId, destinationSchool) => {
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!student) throw createError("Student not found.", 404);
  return prisma.student.update({
    where: { id: studentId },
    data: { status: "TRANSFERRED" },
  });
};

// ─── Get Student Reports ───
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

// ─── Get Student Transcript ───
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

// ─── Bulk Import Students ───
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

// ─── Bulk Import from Excel ───
const bulkImportStudentsFromExcelRows = async (schoolId, rows) => {
  const records = rows.map((r) => ({
    firstName: String(r.firstName || "").trim(),
    lastName: String(r.lastName || "").trim(),
    otherNames: r.otherNames ? String(r.otherNames).trim() : null,
    gender: String(r.gender || "").trim().toUpperCase(),
    dateOfBirth: r.dateOfBirth instanceof Date ? r.dateOfBirth.toISOString() : String(r.dateOfBirth || ""),
    classId: r.classId ? String(r.classId).trim() : null,
    guardianName: r.guardianName ? String(r.guardianName).trim() : null,
    guardianPhone: r.guardianPhone ? String(r.guardianPhone).trim() : null,
    guardianEmail: r.guardianEmail ? String(r.guardianEmail).trim() : null,
    relationship: r.relationship ? String(r.relationship).trim() : null,
  }));

  return bulkImportStudents(schoolId, records);
};

// ─── Export Students for Excel ───
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

// ─── Get all students for Super Admin ───
const getAllStudents = async (query = {}) => {
  try {
    const where = {};
    if (query.schoolId) where.schoolId = query.schoolId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { studentNumber: { contains: query.search, mode: 'insensitive' } }
      ];
    }
    if (query.classId) {
      where.enrollments = { some: { classId: query.classId } };
    }

    const students = await prisma.student.findMany({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            isVerified: true
          }
        },
        guardians: {
          include: {
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true
              }
            }
          }
        },
        enrollments: {
          include: {
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
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            scores: true,
            attendances: true,
            reports: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return students;
  } catch (error) {
    console.error('[student.service] getAllStudents error:', error);
    throw error;
  }
};

// ─── Get student by user ID ───
const getStudentByUserId = async (userId, schoolId) => {
  try {
    const student = await prisma.student.findFirst({
      where: { userId, schoolId },
      include: {
        enrollments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { class: true }
        },
        guardians: {
          include: { guardian: true }
        }
      }
    });
    return student;
  } catch (error) {
    console.error('[student.service] getStudentByUserId error:', error);
    throw error;
  }
};

// ─── Get student grades ───
const getStudentGrades = async (studentId) => {
  try {
    const scores = await prisma.score.findMany({
      where: { studentId },
      include: {
        subject: { select: { name: true, code: true } },
        term: { select: { academicYear: true, termNumber: true } }
      },
      orderBy: [
        { term: { academicYear: 'desc' } },
        { term: { termNumber: 'desc' } },
        { subject: { name: 'asc' } }
      ]
    });
    return scores;
  } catch (error) {
    console.error('[student.service] getStudentGrades error:', error);
    throw error;
  }
};

// ─── EXPORTS ───
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
  bulkImportStudentsFromExcelRows,
  getStudentsForExport,
  getAllStudents,
  getStudentByUserId,
  getStudentGrades,
};