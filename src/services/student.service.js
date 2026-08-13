// src/services/student.service.js
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { prisma } = require("../config/db");
const { generateStudentNumber } = require("../utils/generateId");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");
const { sendWelcomeGuardianEmail } = require("./email.service");

// ─── Admit Student with Guardian Auto-Creation ───
const admitStudent = async (schoolId, data, photoUrl) => {
  const studentNumber = await generateStudentNumber(schoolId);

  // Standard temporary password for students
  const tempPassword = "password123";
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const student = await prisma.$transaction(async (tx) => {
    // 1. Create Student User Account
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

    // Remove fields that don't belong in Student model
    const {
      classId,
      guardianName,
      guardianPhone,
      guardianEmail,
      guardianRelationship,
      relationship, // alias for guardianRelationship
      ...studentData
    } = data;

    // 2. Create Student Profile
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
        status: studentData.status || "ACTIVE",
      },
    });

    // 3. Handle Guardian - Auto-create portal account
    let guardianResult = null;

    // Use guardianEmail or relationship field (support both naming conventions)
    const email = guardianEmail || studentData.guardianEmail || null;
    const name = guardianName || studentData.guardianName || null;
    const phone = guardianPhone || studentData.guardianPhone || null;
    const rel = guardianRelationship || relationship || studentData.guardianRelationship || "Parent";

    if (email && name) {
      // Check if guardian already exists by email
      const existingGuardian = await tx.guardian.findFirst({
        where: {
          schoolId,
          email: email.toLowerCase().trim(),
        },
        include: {
          user: true,
        },
      });

      if (existingGuardian) {
        // ✅ Existing guardian - link student without creating new account
        await tx.studentGuardian.create({
          data: {
            studentId: newStudent.id,
            guardianId: existingGuardian.id,
            isPrimary: true,
          },
        });

        guardianResult = {
          id: existingGuardian.id,
          name: `${existingGuardian.firstName} ${existingGuardian.lastName}`,
          email: existingGuardian.email,
          isNew: false,
          message: "Linked to existing guardian account.",
        };

        console.log(`✅ Linked student to existing guardian: ${existingGuardian.email}`);
      } else {
        // ✅ New guardian - create user account + send credentials
        const tempGuardianPassword = crypto.randomBytes(8).toString("hex");
        const guardianPasswordHash = await bcrypt.hash(tempGuardianPassword, 12);

        // Parse guardian name
        const nameParts = name.trim().split(" ");
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(" ") || " ";

        // Create guardian user account
        const guardianUser = await tx.user.create({
          data: {
            schoolId,
            email: email.toLowerCase().trim(),
            passwordHash: guardianPasswordHash,
            role: "PARENT",
            isVerified: true,
            mustChangePassword: true,
          },
        });

        // Create guardian profile
        const guardian = await tx.guardian.create({
          data: {
            schoolId,
            userId: guardianUser.id,
            firstName: firstName,
            lastName: lastName,
            phone: phone || "",
            email: email.toLowerCase().trim(),
            relationship: rel,
          },
        });

        // Link guardian to student
        await tx.studentGuardian.create({
          data: {
            studentId: newStudent.id,
            guardianId: guardian.id,
            isPrimary: true,
          },
        });

        guardianResult = {
          id: guardian.id,
          name: `${guardian.firstName} ${guardian.lastName}`,
          email: guardian.email,
          isNew: true,
          tempPassword: tempGuardianPassword,
          message: "New guardian portal created. Credentials sent via email.",
        };

        // Send welcome email with temporary password (non-blocking)
        try {
          const school = await tx.school.findUnique({
            where: { id: schoolId },
            select: { name: true },
          });

          await sendWelcomeGuardianEmail(
            guardian.email,
            `${guardian.firstName} ${guardian.lastName}`,
            tempGuardianPassword,
            school?.name || "Your School"
          );
          console.log(`📧 Welcome email sent to guardian: ${guardian.email}`);
        } catch (emailError) {
          console.error("❌ Failed to send guardian welcome email:", emailError.message);
          // Don't fail the transaction if email fails
        }
      }
    } else if (name && !email) {
      // Guardian name provided but no email - create guardian without user account
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || " ";

      const guardian = await tx.guardian.create({
        data: {
          schoolId,
          firstName: firstName,
          lastName: lastName,
          phone: phone || "",
          email: null,
          relationship: rel,
        },
      });

      await tx.studentGuardian.create({
        data: {
          studentId: newStudent.id,
          guardianId: guardian.id,
          isPrimary: true,
        },
      });

      guardianResult = {
        id: guardian.id,
        name: `${guardian.firstName} ${guardian.lastName}`,
        email: null,
        isNew: false,
        message: "Guardian created without login credentials (no email provided).",
      };
    }

    // 4. Enroll in class for active term
    if (classId) {
      const activeTerm = await tx.term.findFirst({
        where: { schoolId, status: "ACTIVE" },
      });

      if (activeTerm) {
        await tx.enrollment.create({
          data: {
            studentId: newStudent.id,
            classId: classId,
            termId: activeTerm.id,
          },
        });
      }
    }

    return { student: newStudent, guardianResult };
  });

  return {
    student: student.student,
    guardian: student.guardianResult,
    studentPortal: {
      email: `${studentNumber}@student.internal`.toLowerCase(),
      password: tempPassword,
    },
  };
};

// ─── Link Existing Guardian to Student ───
const linkGuardianToStudent = async (schoolId, studentId, guardianEmail) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
  });

  if (!student) {
    throw createError("Student not found.", 404);
  }

  const guardian = await prisma.guardian.findFirst({
    where: {
      schoolId,
      email: guardianEmail.toLowerCase().trim(),
    },
  });

  if (!guardian) {
    throw createError("Guardian not found with this email.", 404);
  }

  // Check if already linked
  const existing = await prisma.studentGuardian.findUnique({
    where: {
      studentId_guardianId: {
        studentId,
        guardianId: guardian.id,
      },
    },
  });

  if (existing) {
    throw createError("Guardian is already linked to this student.", 409);
  }

  await prisma.studentGuardian.create({
    data: {
      studentId,
      guardianId: guardian.id,
      isPrimary: true,
    },
  });

  return {
    success: true,
    message: "Guardian linked successfully",
    guardian: {
      id: guardian.id,
      name: `${guardian.firstName} ${guardian.lastName}`,
      email: guardian.email,
    },
  };
};

// ─── Resend Guardian Portal Credentials ───
const resendGuardianCredentials = async (schoolId, guardianId) => {
  const guardian = await prisma.guardian.findFirst({
    where: {
      id: guardianId,
      schoolId,
    },
    include: {
      user: true,
    },
  });

  if (!guardian) {
    throw createError("Guardian not found.", 404);
  }

  if (!guardian.user) {
    throw createError("Guardian does not have a user account.", 400);
  }

  // Generate new temporary password
  const tempPassword = crypto.randomBytes(8).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: guardian.user.id },
    data: {
      passwordHash,
      mustChangePassword: true,
    },
  });

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { name: true },
  });

  await sendWelcomeGuardianEmail(
    guardian.email,
    `${guardian.firstName} ${guardian.lastName}`,
    tempPassword,
    school?.name || "Your School"
  );

  return {
    success: true,
    message: "New credentials sent to guardian email.",
    email: guardian.email,
  };
};

// ─── Get Students ───
const getStudents = async (schoolId, query) => {
  const { skip, take, page, limit } = getPagination(query);

  const where = { schoolId };
  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName: { contains: query.search, mode: "insensitive" } },
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
      where,
      skip,
      take,
      orderBy: { firstName: "asc" },
      select: {
        id: true,
        studentNumber: true,
        firstName: true,
        lastName: true,
        gender: true,
        dateOfBirth: true,
        photoUrl: true,
        status: true,
        admissionDate: true,
        guardians: {
          select: {
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                relationship: true,
                user: {
                  select: {
                    email: true,
                    isActive: true,
                  },
                },
              },
            },
            isPrimary: true,
          },
        },
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
        include: {
          guardian: {
            include: {
              user: {
                select: {
                  email: true,
                  isActive: true,
                  lastLoginAt: true,
                },
              },
            },
          },
        },
      },
      enrollments: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          class: {
            select: {
              level: true,
              section: true,
              classTeacher: { select: { firstName: true, lastName: true } },
            },
          },
          term: { select: { academicYear: true, termNumber: true, status: true } },
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
    where: { id: studentId, schoolId },
  });
  if (!student) throw createError("Student not found.", 404);

  // Remove fields that don't belong in Student model
  const {
    classId,
    guardianName,
    guardianPhone,
    guardianEmail,
    guardianRelationship,
    relationship,
    ...studentData
  } = data;

  // Prepare update data for student
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
  const name = guardianName || studentData.guardianName || null;
  const email = guardianEmail || studentData.guardianEmail || null;
  const phone = guardianPhone || studentData.guardianPhone || null;
  const rel = guardianRelationship || relationship || studentData.guardianRelationship || null;

  if (name || email || phone || rel) {
    // Find existing primary guardian for this student
    const existingGuardianLink = await prisma.studentGuardian.findFirst({
      where: {
        studentId: studentId,
        isPrimary: true,
      },
      include: { guardian: true },
    });

    if (existingGuardianLink) {
      // Update existing guardian
      const guardianData = {};
      if (name) {
        const nameParts = name.trim().split(" ");
        guardianData.firstName = nameParts[0];
        guardianData.lastName = nameParts.slice(1).join(" ") || " ";
      }
      if (phone) guardianData.phone = phone;
      if (email) guardianData.email = email.toLowerCase().trim();
      if (rel) guardianData.relationship = rel;

      await prisma.guardian.update({
        where: { id: existingGuardianLink.guardianId },
        data: guardianData,
      });
    } else if (name) {
      // Create new guardian
      const nameParts = name.trim().split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || " ";

      // Check if guardian with this email already exists
      let guardian;
      if (email) {
        guardian = await prisma.guardian.findFirst({
          where: {
            schoolId,
            email: email.toLowerCase().trim(),
          },
        });
      }

      if (!guardian) {
        guardian = await prisma.guardian.create({
          data: {
            schoolId: schoolId,
            firstName: firstName,
            lastName: lastName,
            phone: phone || null,
            email: email || null,
            relationship: rel || "Guardian",
          },
        });
      }

      // Link guardian to student
      await prisma.studentGuardian.create({
        data: {
          studentId: studentId,
          guardianId: guardian.id,
          isPrimary: true,
        },
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
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
  });
  if (!student) throw createError("Student not found.", 404);
  return prisma.student.update({
    where: { id: studentId },
    data: { status: "WITHDRAWN" },
  });
};

// ─── Transfer Student ───
const transferStudent = async (schoolId, studentId, destinationSchool) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
  });
  if (!student) throw createError("Student not found.", 404);
  return prisma.student.update({
    where: { id: studentId },
    data: { status: "TRANSFERRED" },
  });
};

// ─── Get Student Reports ───
const getStudentReports = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
  });
  if (!student) throw createError("Student not found.", 404);

  return prisma.report.findMany({
    where: { studentId },
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
      id: true,
      studentNumber: true,
      firstName: true,
      lastName: true,
      gender: true,
      dateOfBirth: true,
      photoUrl: true,
    },
  });
  if (!student) throw createError("Student not found.", 404);

  const terms = await prisma.term.findMany({
    where: { schoolId },
    orderBy: [{ academicYear: "asc" }, { termNumber: "asc" }],
    select: { id: true, academicYear: true, termNumber: true },
  });

  const transcript = await Promise.all(
    terms.map(async (term) => {
      const scores = await prisma.score.findMany({
        where: { studentId, termId: term.id },
        include: { subject: { select: { name: true, code: true } } },
      });

      const report = await prisma.report.findFirst({
        where: { studentId, termId: term.id },
        select: {
          classPosition: true,
          totalStudents: true,
          aggregate: true,
          daysPresent: true,
          daysAbsent: true,
        },
      });

      return { term, scores, report };
    })
  );

  return { student, transcript: transcript.filter((t) => t.scores.length > 0) };
};

// ─── Bulk Import Students ───
const bulkImportStudents = async (schoolId, records) => {
  let created = 0,
    skipped = 0;
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
    guardianRelationship: r.relationship || r.guardianRelationship || null,
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
      studentNumber: true,
      firstName: true,
      lastName: true,
      otherNames: true,
      gender: true,
      dateOfBirth: true,
      status: true,
      admissionDate: true,
      guardians: {
        where: { isPrimary: true },
        select: {
          guardian: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              relationship: true,
            },
          },
        },
      },
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
    guardianName: s.guardians[0]?.guardian
      ? `${s.guardians[0].guardian.firstName} ${s.guardians[0].guardian.lastName}`.trim()
      : "",
    guardianEmail: s.guardians[0]?.guardian?.email || "",
    guardianPhone: s.guardians[0]?.guardian?.phone || "",
    guardianRelationship: s.guardians[0]?.guardian?.relationship || "",
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
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { studentNumber: { contains: query.search, mode: "insensitive" } },
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
            name: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            isVerified: true,
          },
        },
        guardians: {
          include: {
            guardian: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        enrollments: {
          include: {
            class: {
              select: {
                id: true,
                level: true,
                section: true,
              },
            },
            term: {
              select: {
                id: true,
                academicYear: true,
                termNumber: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            scores: true,
            attendances: true,
            reports: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return students;
  } catch (error) {
    console.error("[student.service] getAllStudents error:", error);
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
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { class: true },
        },
        guardians: {
          include: { guardian: true },
        },
      },
    });
    return student;
  } catch (error) {
    console.error("[student.service] getStudentByUserId error:", error);
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
        term: { select: { academicYear: true, termNumber: true } },
      },
      orderBy: [
        { term: { academicYear: "desc" } },
        { term: { termNumber: "desc" } },
        { subject: { name: "asc" } },
      ],
    });
    return scores;
  } catch (error) {
    console.error("[student.service] getStudentGrades error:", error);
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
  linkGuardianToStudent, // NEW
  resendGuardianCredentials, // NEW
};