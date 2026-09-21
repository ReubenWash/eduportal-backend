// src/services/student.service.js
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { prisma } = require("../config/db");
const { generateStudentNumber } = require("../utils/generateId");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");
const { sendWelcomeGuardianEmail } = require("./email.service");
const ExcelJS = require("exceljs");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");
const { parseStudentSheet, checkStudentRows } = require("../utils/studentImport");

// Every new student starts with the same temporary password and must change it at first login,
// so the (slow) bcrypt hash is computed once and reused instead of once per student.
const STUDENT_TEMP_PASSWORD = "password123";
let studentTempHash = null;
const getStudentTempHash = async () => {
  if (!studentTempHash) studentTempHash = await bcrypt.hash(STUDENT_TEMP_PASSWORD, 12);
  return studentTempHash;
};

const getOrCreateEnrollmentTerm = async (tx, schoolId, classId) => {
  let activeTerm = await tx.term.findFirst({
    where: { schoolId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
  });

  if (activeTerm) return activeTerm;

  const classRecord = classId
    ? await tx.class.findUnique({
        where: { id: classId },
        select: { academicYear: true, level: true, section: true },
      })
    : null;

  if (classRecord?.academicYear) {
    activeTerm = await tx.term.findFirst({
      where: { schoolId, academicYear: classRecord.academicYear },
      orderBy: [{ termNumber: "asc" }, { startDate: "asc" }],
    });
  }

  if (activeTerm) return activeTerm;

  const academicYear = classRecord?.academicYear || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  const startDate = new Date(new Date().getFullYear(), 0, 1);
  const endDate = new Date(new Date().getFullYear(), 11, 31);

  return tx.term.create({
    data: {
      schoolId,
      academicYear,
      termNumber: "TERM1",
      startDate,
      endDate,
      status: "ACTIVE",
    },
  });
};

// ─── Admit Student with Guardian Auto-Creation ───
const admitStudent = async (schoolId, data, photoUrl) => {
  const studentNumber = await generateStudentNumber(schoolId);

  // Standard temporary password for students
  const tempPassword = STUDENT_TEMP_PASSWORD;
  const passwordHash = await getStudentTempHash();

  const student = await prisma.$transaction(async (tx) => {
    // The class must belong to THIS school (never trust a class id sent by the browser)
    if (data.classId) {
      const ownClass = await tx.class.findFirst({ where: { id: data.classId, schoolId }, select: { id: true } });
      if (!ownClass) throw createError("Class not found.", 404);
    }

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
      const normalizedEmail = email.toLowerCase().trim();

      // ✅ FIX: User.email is GLOBALLY unique, so look up the User first,
      // not the Guardian scoped by schoolId. This prevents P2002 crashes
      // when the email already exists (in another school, as an orphan, etc.)
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        include: { guardianProfile: true },
      });

      if (existingUser && existingUser.guardianProfile) {
        // ✅ Existing guardian - link student without creating new account
        await tx.studentGuardian.create({
          data: {
            studentId: newStudent.id,
            guardianId: existingUser.guardianProfile.id,
            isPrimary: true,
          },
        });

        guardianResult = {
          id: existingUser.guardianProfile.id,
          name: `${existingUser.guardianProfile.firstName} ${existingUser.guardianProfile.lastName}`,
          email: existingUser.guardianProfile.email,
          isNew: false,
          message: "Linked to existing guardian account.",
        };

        console.log(`✅ Linked student to existing guardian: ${existingUser.guardianProfile.email}`);
      } else if (existingUser) {
        // ⚠️ User exists but has no Guardian profile — refuse cleanly (409, not 500)
        throw createError(
          `A user account with email ${normalizedEmail} already exists but is not a guardian.`,
          409
        );
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
            email: normalizedEmail,
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
            email: normalizedEmail,
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

    // 4. Enroll in class for the current/active term.
    // If no term exists yet, create a default active term so the class assignment is never silently lost.
    if (classId) {
      const activeTerm = await getOrCreateEnrollmentTerm(tx, schoolId, classId);

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
    const activeTerm = await getOrCreateEnrollmentTerm(prisma, schoolId, classId);

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
// `records` are already checked and cleaned (see previewStudentImport). Each record creates the
// student, their login, the guardian (with a portal login if an email is given) and enrols the
// student in the class for the active term. Returns one result per record so the caller can show
// exactly what happened to each row.
const bulkImportStudents = async (schoolId, records = []) => {
  let created = 0;
  let skipped = 0;
  const failed = [];
  const results = [];

  const classIds = [...new Set(records.map((r) => r.classId).filter(Boolean))];
  const ownClasses = classIds.length
    ? new Set(
        (await prisma.class.findMany({ where: { id: { in: classIds }, schoolId }, select: { id: true } })).map((c) => c.id)
      )
    : new Set();

  for (let index = 0; index < records.length; index += 1) {
    const row = records[index];
    try {
      if (!row.firstName || !row.lastName || !row.gender || !row.dateOfBirth) {
        skipped += 1;
        results.push({ index, status: "skipped", error: "First name, last name, gender and date of birth are required." });
        continue;
      }
      if (row.classId && !ownClasses.has(row.classId)) {
        throw createError("Class not found.", 404);
      }

      const admitted = await admitStudent(schoolId, row, null);
      created += 1;
      results.push({
        index,
        status: "created",
        studentId: admitted.student.id,
        studentNumber: admitted.student.studentNumber,
        studentPortal: admitted.studentPortal,
        guardian: admitted.guardian
          ? {
              name: admitted.guardian.name,
              email: admitted.guardian.email,
              isNew: admitted.guardian.isNew,
              // only for a brand-new portal account; it is also emailed to the guardian
              tempPassword: admitted.guardian.isNew ? admitted.guardian.tempPassword : undefined,
            }
          : null,
      });
    } catch (err) {
      failed.push({ row, error: err.message });
      results.push({ index, status: "failed", error: err.message });
    }
  }

  return { created, skipped, failed, results };
};

// ─── Bulk import context: what the spreadsheet is checked against ───
// Students are enrolled in the ACTIVE term, so only classes of that academic year are valid.
const getImportContext = async (schoolId) => {
  const activeTerm = await prisma.term.findFirst({
    where: { schoolId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
  });

  const classes = await prisma.class.findMany({
    where: { schoolId, ...(activeTerm ? { academicYear: activeTerm.academicYear } : {}) },
    select: { id: true, level: true, section: true, academicYear: true },
    orderBy: [{ level: "asc" }, { section: "asc" }],
  });

  return { activeTerm, classes };
};

const classLabel = (c) => `${String(c.level).replace(/^JHS(\d)$/, "JHS $1")} ${c.section}`;

// ─── Step 1 of the import: read + check the spreadsheet, change nothing ───
const previewStudentImport = async (schoolId, buffer) => {
  const parsed = await parseStudentSheet(buffer);
  const { activeTerm, classes } = await getImportContext(schoolId);

  const existingStudents = await prisma.student.findMany({
    where: { schoolId },
    select: { firstName: true, lastName: true, dateOfBirth: true, studentNumber: true },
  });

  const emails = [...new Set(
    parsed.map((r) => String(r.raw.guardianEmail || "").trim().toLowerCase()).filter(Boolean)
  )];
  const users = emails.length
    ? await prisma.user.findMany({
        where: { email: { in: emails } },
        select: { email: true, guardianProfile: { select: { id: true } } },
      })
    : [];
  const guardianAccounts = new Map(
    users.map((u) => [String(u.email).toLowerCase(), { isGuardian: Boolean(u.guardianProfile) }])
  );

  const { rows, summary } = checkStudentRows(parsed, { classes, existingStudents, guardianAccounts });

  return {
    term: activeTerm
      ? { id: activeTerm.id, label: `${activeTerm.academicYear} ${String(activeTerm.termNumber).replace("TERM", "Term ")}` }
      : null,
    classes: classes.map(classLabel),
    summary,
    rows,
  };
};

// ─── Legacy one-shot import (API clients): check, then import every ready row ───
const bulkImportStudentsFromExcelBuffer = async (schoolId, buffer) => {
  const preview = await previewStudentImport(schoolId, buffer);
  const ready = preview.rows.filter((r) => r.status === "ready");
  const outcome = await bulkImportStudents(schoolId, ready.map((r) => r.data));
  return {
    ...outcome,
    duplicates: preview.summary.duplicates,
    rejected: preview.rows
      .filter((r) => r.status === "error")
      .map((r) => ({ row: r.rowNumber, errors: r.errors })),
  };
};

// ─── Downloadable Excel template (with the school's own class list) ───
const buildImportTemplate = async (schoolId) => {
  const { activeTerm, classes } = await getImportContext(schoolId);

  const wb = new ExcelJS.Workbook();
  wb.creator = "EduTrack";

  const NAVY = "FF1E2A78";
  const GREY = "FF6B7280";
  const ws = wb.addWorksheet("Students", { views: [{ state: "frozen", ySplit: 1 }] });
  const columns = [
    { header: "First Name",     key: "firstName",     width: 18, required: true },
    { header: "Last Name",      key: "lastName",      width: 18, required: true },
    { header: "Other Names",    key: "otherNames",    width: 18 },
    { header: "Gender",         key: "gender",        width: 10, required: true },
    { header: "Date of Birth",  key: "dateOfBirth",   width: 14, required: true },
    { header: "Class",          key: "className",     width: 12 },
    { header: "Guardian Name",  key: "guardianName",  width: 24 },
    { header: "Guardian Phone", key: "guardianPhone", width: 16 },
    { header: "Guardian Email", key: "guardianEmail", width: 28 },
    { header: "Relationship",   key: "relationship",  width: 14 },
  ];
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  columns.forEach((c, i) => {
    const cell = ws.getRow(1).getCell(i + 1);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c.required ? NAVY : GREY } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 22;

  // Dates as dates, phone numbers as text (so the leading 0 is kept)
  for (let r = 2; r <= 1001; r += 1) {
    ws.getCell(r, 5).numFmt = "dd/mm/yyyy";
    ws.getCell(r, 8).numFmt = "@";
  }

  // Classes sheet (also feeds the dropdown)
  const cs = wb.addWorksheet("Classes");
  cs.columns = [{ header: "Class", key: "label", width: 16 }, { header: "Academic year", key: "year", width: 16 }];
  cs.getRow(1).font = { bold: true };
  classes.forEach((c) => cs.addRow({ label: classLabel(c), year: c.academicYear }));

  for (let r = 2; r <= 1001; r += 1) {
    ws.getCell(r, 4).dataValidation = {
      type: "list", allowBlank: true, formulae: ['"MALE,FEMALE"'],
      showErrorMessage: true, errorTitle: "Gender", error: "Choose MALE or FEMALE.",
    };
    if (classes.length > 0) {
      ws.getCell(r, 6).dataValidation = {
        type: "list", allowBlank: true, formulae: [`Classes!$A$2:$A$${classes.length + 1}`],
        showErrorMessage: true, errorTitle: "Class", error: "Choose a class from the list.",
      };
    }
  }

  // Instructions sheet
  const info = wb.addWorksheet("Instructions");
  info.columns = [{ width: 110 }];
  const lines = [
    ["How to register and enrol students in bulk", true],
    ["", false],
    ["1. Fill in the 'Students' sheet: one student per row, starting on row 2. Do not change the headings in row 1.", false],
    ["2. Required (dark headings): First Name, Last Name, Gender (MALE or FEMALE), Date of Birth (dd/mm/yyyy).", false],
    ["3. Class: pick from the dropdown (the list is on the 'Classes' sheet). Students are enrolled in that class for the active term" +
      (activeTerm ? ` (${activeTerm.academicYear} ${String(activeTerm.termNumber).replace("TERM", "Term ")}).` : " - there is no active term yet, create one first."), false],
    ["4. Guardian details are optional. With a Guardian Email, the guardian gets a parent portal login by email. Brothers and sisters can share the same guardian email.", false],
    ["5. Save the file as .xlsx, then upload it on the Students page (Import students). You will see a check of every row before anything is saved.", false],
    ["", false],
    ["Example row: Kofi | Mensah | | MALE | 05/03/2012 | JHS 1 A | Ama Mensah | 0244123456 | ama@example.com | Mother", false],
    ["", false],
    ["Each student gets a Student ID (their login) and a temporary password that they must change at first login.", false],
  ];
  lines.forEach(([text, bold]) => {
    const row = info.addRow([text]);
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    if (bold) row.getCell(1).font = { bold: true, size: 14 };
  });

  return wb.xlsx.writeBuffer();
};

// ─── Set / replace one student's passport photo ───
// Uploads to Cloudinary as a portrait centred on the face (4:5) and saves the URL on the student.
const setStudentPhoto = async (schoolId, studentId, buffer) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    select: { id: true },
  });
  if (!student) throw createError("Student not found.", 404);

  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "students",
        transformation: [{ width: 400, height: 480, crop: "fill", gravity: "face" }],
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });

  return prisma.student.update({
    where: { id: studentId },
    data: { photoUrl: uploaded.secure_url },
    select: { id: true, studentNumber: true, photoUrl: true },
  });
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
  previewStudentImport,
  setStudentPhoto,
  buildImportTemplate,
  bulkImportStudentsFromExcelBuffer,
  getStudentsForExport,
  getAllStudents,
  getStudentByUserId,
  getStudentGrades,
  linkGuardianToStudent,
  resendGuardianCredentials,
};