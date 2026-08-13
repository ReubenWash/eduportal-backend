const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { prisma }  = require("../config/db");
const { generateSchoolSlug } = require("../utils/generateId");
const { sendVerificationEmail, sendRegistrationUnderReviewEmail, sendSchoolStatusEmail } = require("./email.service");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");
const { buildSuperAdminDashboardPayload } = require("../utils/superAdminDashboard");

// ── Register new school ────────────────────────────────────────
const registerSchool = async ({ name, email, password, region, district, headmasterName, gesNumber, address, phone, plan }) => {
  // Check email not already in use
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw createError("An account with this email already exists.", 409);

  const slug         = generateSchoolSlug(name);
  const passwordHash = await bcrypt.hash(password, 12);

  // Create school + admin user in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name,
        slug,
        email,
        region,
        district,
        gesNumber: gesNumber || null,
        address:   address   || null,
        phone:     phone     || null,
        status:    "PENDING",
        plan:      plan      || "BASIC",
      },
    });

    const user = await tx.user.create({
      data: {
        schoolId:     school.id,
        email,
        passwordHash,
        role:         "SCHOOL_ADMIN",
        isVerified:   false,
      },
    });

    // Create staff profile for the headmaster
    await tx.staff.create({
      data: {
        userId:      user.id,
        schoolId:    school.id,
        firstName:   headmasterName.split(" ")[0],
        lastName:    headmasterName.split(" ").slice(1).join(" ") || "",
        staffNumber: "HM-001",
      },
    });

    return { school, user };
  });

  // ─── Generate 6-digit verification code ──────────────────────
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Store the verification code in refreshToken table with verify_ prefix
  await prisma.refreshToken.create({
    data: {
      userId: result.user.id,
      token: `verify_${verificationCode}`,
      expiresAt,
    },
  });

  await prisma.notification.create({
    data: {
      userId: result.user.id,
      title: "Registration Under Review",
      message: `Your registration for ${name} has been received and is currently under review. Please verify your email using the 6-digit code sent to your email.`,
      type: "info",
    }
  });

  // ─── Send emails with the verification code ──────────────────
  try {
    await sendVerificationEmail(email, headmasterName, verificationCode);
  } catch (emailError) {
    console.warn('⚠️ Verification email failed (non-blocking):', emailError.message);
  }

  try {
    await sendRegistrationUnderReviewEmail(email, headmasterName, name);
  } catch (emailError) {
    console.warn('⚠️ Under review email failed (non-blocking):', emailError.message);
  }

  return {
    id:     result.school.id,
    name:   result.school.name,
    slug:   result.school.slug,
    status: result.school.status,
  };
};

const manualCreateSchool = async ({ name, email, password, region, district, headmasterName, gesNumber, address, phone, plan }) => {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw createError("An account with this email already exists.", 409);

  const slug         = generateSchoolSlug(name);
  const passwordHash = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const school = await tx.school.create({
      data: {
        name,
        slug,
        email,
        region,
        district,
        gesNumber: gesNumber || null,
        address:   address   || null,
        phone:     phone     || null,
        status:    "ACTIVE",
        plan:      plan      || "BASIC",
      },
    });

    const user = await tx.user.create({
      data: {
        schoolId:     school.id,
        email,
        passwordHash,
        role:         "SCHOOL_ADMIN",
        isVerified:   true,
      },
    });

    await tx.staff.create({
      data: {
        userId:      user.id,
        schoolId:    school.id,
        firstName:   headmasterName.split(" ")[0],
        lastName:    headmasterName.split(" ").slice(1).join(" ") || "",
        staffNumber: "HM-001",
      },
    });

    return { school, user };
  });

  return result.school;
};

// ── Get school profile ─────────────────────────────────────────
const getSchoolProfile = async (schoolId) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      id:           true,
      name:         true,
      slug:         true,
      gesNumber:    true,
      region:       true,
      district:     true,
      address:      true,
      phone:        true,
      email:        true,
      logoUrl:      true,
      motto:        true,
      status:       true,
      plan:         true,
      reportConfig: true,
      scoreLabels:  true,
      createdAt:    true,
    },
  });

  if (!school) throw createError("School not found.", 404);
  return school;
};

// ── Update school profile ──────────────────────────────────────
const updateSchoolProfile = async (schoolId, data, logoUrl) => {
  const updateData = { ...data };
  if (logoUrl) updateData.logoUrl = logoUrl;

  return prisma.school.update({
    where: { id: schoolId },
    data:  updateData,
  });
};

// ── Update any school by id (SUPER_ADMIN) ───────────────────────
const updateSchoolById = async (schoolId, data) => {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw createError("School not found.", 404);

  const {
    name, email, phone, region, district, address,
    gesNumber, status,
  } = data;
  const updateData = {
    ...(name           !== undefined && { name }),
    ...(email          !== undefined && { email }),
    ...(phone          !== undefined && { phone }),
    ...(region         !== undefined && { region }),
    ...(district       !== undefined && { district }),
    ...(address        !== undefined && { address }),
    ...(gesNumber      !== undefined && { gesNumber }),
    ...(status         !== undefined && { status }),
  };

  return prisma.school.update({ where: { id: schoolId }, data: updateData });
};

// ── Assign/change a school's plan (SUPER_ADMIN) ─────────────────
const updateSchoolPlan = async (schoolId, plan) => {
  if (!plan) throw createError("Plan is required.", 400);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw createError("School not found.", 404);

  const planDef = await prisma.planDefinition.findUnique({ where: { name: plan } });
  if (!planDef) throw createError(`Unknown plan "${plan}".`, 400);

  const updatedSchool = await prisma.school.update({
    where: { id: schoolId },
    data: { plan },
  });

  const subscription = await prisma.subscription.findUnique({ where: { schoolId } });
  if (subscription) {
    await prisma.subscription.update({
      where: { schoolId },
      data: { plan, price: planDef.price, currency: planDef.currency },
    });
  } else {
    await prisma.subscription.create({
      data: {
        schoolId,
        plan,
        status: "ACTIVE",
        autoRenew: true,
        price: planDef.price,
        currency: planDef.currency,
        startDate: new Date(),
      },
    });
  }

  return updatedSchool;
};

// ── Dashboard stats ────────────────────────────────────────────
const getDashboardStats = async (schoolId, user) => {
  console.log('🔍 getDashboardStats called for school:', schoolId);
  console.log('🔍 User role:', user?.role);
  console.log('🔍 User ID:', user?.id);

  const [
    totalStudents,
    totalStaff,
    totalClasses,
    activeTerm,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.staff.count({ 
      where: { 
        schoolId,
        user: { isActive: true }
      } 
    }),
    prisma.class.count({ where: { schoolId } }),
    prisma.term.findFirst({
      where:   { schoolId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select:  { id: true, academicYear: true, termNumber: true, startDate: true, endDate: true },
    }),
  ]);

  // Compute pass rate from scores in active term
  let passRate = null;
  if (activeTerm) {
    const scores = await prisma.score.findMany({
      where: {
        termId:  activeTerm.id,
        total:   { not: null },
        student: { schoolId },
      },
      select: { total: true },
    });

    if (scores.length > 0) {
      const passed = scores.filter((s) => s.total >= 50).length;
      passRate = Math.round((passed / scores.length) * 100);
    }
  }

  const baseStats = { totalStudents, totalStaff, totalClasses, activeTerm, passRate };

  // ─── Class Teacher Dashboard ───
  if (user && user.role === 'CLASS_TEACHER') {
    console.log('🔍 Processing Class Teacher dashboard');
    
    let staffId = user.staff?.id;
    
    if (!staffId) {
      console.log('⚠️ Staff ID not in user object, fetching from database...');
      const staff = await prisma.staff.findFirst({
        where: { 
          userId: user.id,
          schoolId: schoolId
        }
      });
      
      if (staff) {
        staffId = staff.id;
        console.log('✅ Found staff ID from database:', staffId);
      } else {
        console.log('❌ No staff profile found for this user');
        return { 
          ...baseStats, 
          myClass: null, 
          message: 'Staff profile not found. Please contact your school administrator.' 
        };
      }
    }

    console.log('✅ Staff ID:', staffId);

    const staffClass = await prisma.class.findFirst({ 
      where: { 
        classTeacherId: staffId,
        schoolId: schoolId
      },
      include: {
        enrollments: {
          where: {
            termId: activeTerm?.id
          },
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                studentNumber: true,
                photoUrl: true,
                gender: true,
                status: true,
                dateOfBirth: true,
              }
            }
          }
        }
      }
    });
    
    console.log('✅ Found class:', staffClass?.id);
    console.log('✅ Enrollments count:', staffClass?.enrollments?.length || 0);
    
    if (!staffClass) {
      console.log('⚠️ No class found for Class Teacher');
      return { 
        ...baseStats, 
        myClass: null, 
        message: 'No class assigned. Please contact your school administrator.' 
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const studentIds = staffClass.enrollments.map(e => e.studentId);
    
    const attendances = await prisma.attendance.findMany({
      where: { 
        classId: staffClass.id, 
        date: { gte: today },
        studentId: {
          in: studentIds
        }
      }
    });

    const attendanceMap = {};
    attendances.forEach(a => {
      attendanceMap[a.studentId] = a.status;
    });

    const classStudents = staffClass.enrollments.map(e => {
      const student = e.student;
      return {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`,
        studentNo: student.studentNumber,
        photo: student.photoUrl,
        gender: student.gender,
        status: student.status,
        dateOfBirth: student.dateOfBirth,
        presentToday: attendanceMap[student.id] === 'PRESENT'
      };
    });

    console.log('✅ Returning class with', classStudents.length, 'students');
    
    return { 
      ...baseStats, 
      myClass: { 
        id: staffClass.id,
        name: `${staffClass.level} ${staffClass.section}`,
        level: staffClass.level,
        section: staffClass.section,
        students: classStudents 
      } 
    };
  }

  // ─── Subject Teacher Dashboard ───
  if (user && user.role === 'SUBJECT_TEACHER') {
    console.log('🔍 Processing Subject Teacher dashboard');
    
    let staffId = user.staff?.id;
    
    if (!staffId) {
      console.log('⚠️ Staff ID not in user object, fetching from database...');
      const staff = await prisma.staff.findFirst({
        where: { 
          userId: user.id,
          schoolId: schoolId
        }
      });
      
      if (staff) {
        staffId = staff.id;
        console.log('✅ Found staff ID from database:', staffId);
      } else {
        console.log('❌ No staff profile found for Subject Teacher');
        return baseStats;
      }
    }

    const assignments = await prisma.staffSubject.findMany({
      where: { staffId: staffId },
      include: { class: true, subject: true }
    });
    
    const activeTermForTeacher = activeTerm || await prisma.term.findFirst({
      where: { schoolId, status: "ACTIVE" },
    });
    
    const myAssignments = await Promise.all(
      assignments.map(async (a) => {
        const scores = await prisma.score.findMany({
          where: {
            subjectId: a.subjectId,
            termId: activeTermForTeacher?.id,
            student: {
              enrollments: {
                some: {
                  classId: a.classId,
                  termId: activeTermForTeacher?.id
                }
              }
            }
          }
        });
        
        const studentCount = await prisma.enrollment.count({
          where: {
            classId: a.classId,
            termId: activeTermForTeacher?.id
          }
        });
        
        const isSubmitted = scores.length > 0 && scores.length === studentCount;
        
        return {
          class: `${a.class.level} ${a.class.section}`,
          subject: a.subject.name,
          submitted: isSubmitted,
          students: studentCount,
          date: isSubmitted ? new Date().toLocaleDateString() : null
        };
      })
    );

    return { 
      ...baseStats, 
      myAssignments,
      mySubjects: assignments.length.toString()
    };
  }

  return baseStats;
};

// ── Super Admin Dashboard ─────────────────────────────────────
const getSuperAdminDashboard = async () => {
  const [
    schools,
    activeSchools,
    students,
    staff,
    verifiedUsers,
    pendingApplications,
    recentActivity,
  ] = await Promise.all([
    prisma.school.count({ where: { status: { not: "DEACTIVATED" } } }),
    prisma.school.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.staff.count({ 
      where: { 
        user: { isActive: true }
      } 
    }),
    prisma.user.count({ where: { isVerified: true, role: { not: 'SUPER_ADMIN' } } }),
    prisma.school.count({ where: { status: 'PENDING' } }),
    prisma.school.findMany({
      where: { status: { not: "DEACTIVATED" } },
      select: { id: true, name: true, status: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
  ]);

  const registrationTrend = await prisma.$queryRaw`
    SELECT to_char("createdAt", 'Mon') as month, COUNT(*)::int as count
    FROM schools
    WHERE "createdAt" >= CURRENT_DATE - INTERVAL '6 months'
    AND status != 'DEACTIVATED'
    GROUP BY 1
    ORDER BY MIN("createdAt")
  `;

  return buildSuperAdminDashboardPayload({
    totals: {
      schools,
      activeSchools,
      students,
      staff,
      verifiedUsers,
      pendingApplications,
    },
    registrationTrend: Array.isArray(registrationTrend)
      ? registrationTrend.map((item) => ({ month: item.month, schools: Number(item.count || 0) }))
      : [],
    recentActivity: recentActivity.map((item) => ({
      id: item.id,
      text: item.status === 'PENDING' ? `Pending registration: ${item.name}` : `${item.status.toLowerCase()} school: ${item.name}`,
      type: item.status,
      createdAt: item.createdAt,
    })),
  });
};

// ── Terms ──────────────────────────────────────────────────────
// ✅ UPDATED: Auto-update term status based on current date
const getTerms = async (schoolId, academicYear) => {
  const terms = await prisma.term.findMany({
    where: {
      schoolId,
      ...(academicYear && { academicYear }),
    },
    orderBy: [{ academicYear: "desc" }, { termNumber: "asc" }],
  });

  // ✅ Auto-update term status based on current date
  const now = new Date();
  const updatedTerms = terms.map(term => {
    let status = term.status;
    const startDate = new Date(term.startDate);
    const endDate = new Date(term.endDate);
    
    // If term is UPCOMING but startDate has passed, set to ACTIVE
    if (status === "UPCOMING" && startDate <= now) {
      status = "ACTIVE";
    }
    
    // If term is ACTIVE but endDate has passed, set to COMPLETED
    if (status === "ACTIVE" && endDate < now) {
      status = "COMPLETED";
    }
    
    return { ...term, status };
  });

  return updatedTerms;
};

// ✅ UPDATED: Auto-set term status based on dates
const createTerm = async (schoolId, data) => {
  const exists = await prisma.term.findFirst({
    where: {
      schoolId,
      academicYear: data.academicYear,
      termNumber:   data.termNumber,
    },
  });
  if (exists) throw createError(`${data.termNumber} for ${data.academicYear} already exists.`, 409);

  // ✅ Auto-set status based on dates
  const now = new Date();
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  
  let status = data.status || "UPCOMING";
  
  // If start date is in the past, set to ACTIVE
  if (startDate <= now) {
    status = "ACTIVE";
  }
  
  // If end date is in the past, set to COMPLETED
  if (endDate < now) {
    status = "COMPLETED";
  }

  return prisma.term.create({
    data: { 
      schoolId, 
      ...data,
      status,
    },
  });
};

// ✅ UPDATED: Handle status changes and auto-update dates
const updateTerm = async (schoolId, termId, data) => {
  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId },
  });

  if (!term) {
    throw createError("Term not found", 404);
  }

  // ✅ If activating, deactivate all other terms first
  if (data.status === "ACTIVE") {
    await prisma.term.updateMany({
      where: { schoolId, status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
  }

  // ✅ If start date is being updated, auto-set status
  if (data.startDate) {
    const now = new Date();
    const startDate = new Date(data.startDate);
    
    if (startDate <= now && data.status !== "COMPLETED") {
      data.status = "ACTIVE";
    }
  }

  return prisma.term.update({
    where: { id: termId },
    data,
  });
};

// ✅ NEW: Manually update term status
const updateTermStatus = async (schoolId, termId, status) => {
  const term = await prisma.term.findFirst({
    where: { id: termId, schoolId },
  });
  
  if (!term) {
    throw createError("Term not found", 404);
  }

  const validStatuses = ["UPCOMING", "ACTIVE", "COMPLETED"];
  if (!validStatuses.includes(status)) {
    throw createError("Invalid status. Must be one of: UPCOMING, ACTIVE, COMPLETED", 400);
  }

  // ✅ If activating, deactivate all other active terms
  if (status === "ACTIVE") {
    await prisma.term.updateMany({
      where: { schoolId, status: "ACTIVE" },
      data: { status: "COMPLETED" },
    });
  }

  return prisma.term.update({
    where: { id: termId },
    data: { status },
  });
};

// ── Super admin: list all schools ─────────────────────────────
const getAllSchools = async (query) => {
  const { skip, take, page, limit } = getPagination(query);
  
  const where = {
    status: { not: "DEACTIVATED" }
  };
  
  if (query.status) {
    where.status = query.status;
  }
  
  if (query.search) {
    where.OR = [
      { name:     { contains: query.search, mode: "insensitive" } },
      { district: { contains: query.search, mode: "insensitive" } },
      { region:   { contains: query.search, mode: "insensitive" } },
    ];
  }

  const [schools, total] = await Promise.all([
    prisma.school.findMany({
      where, skip, take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, slug: true, region: true,
        district: true, email: true, status: true, plan: true,
        createdAt: true, _count: { select: { students: true, staff: true } },
      },
    }),
    prisma.school.count({ where }),
  ]);

  return paginatedResponse(schools, total, page, limit);
};

// ── Super admin: update school status ─────────────────────────
const updateSchoolStatus = async (schoolId, status) => {
  console.log(`[updateSchoolStatus] Starting update for school ${schoolId} to status ${status}`);
  
  const validStatuses = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'REJECTED'];
  if (!validStatuses.includes(status)) {
    throw createError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, status: true, email: true }
  });

  if (!school) {
    throw createError("School not found.", 404);
  }

  console.log(`[updateSchoolStatus] Current school status: ${school.status}`);

  const updatedSchool = await prisma.school.update({
    where: { id: schoolId },
    data: { 
      status: status,
      updatedAt: new Date()
    },
  });

  console.log(`[updateSchoolStatus] Updated school status: ${updatedSchool.status}`);

  // ─── Invalidate all sessions for users of this school ───
  const schoolUsers = await prisma.user.findMany({
    where: { schoolId },
    select: { id: true, email: true, role: true }
  });

  if (schoolUsers.length > 0) {
    const userIds = schoolUsers.map(u => u.id);
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: {
        userId: { in: userIds }
      }
    });
    console.log(`[AUTH] Invalidated ${deletedTokens.count} sessions for ${schoolUsers.length} users of school ${school.name}`);
  }

  await prisma.auditLog.create({
    data: {
      action: "UPDATE",
      resource: "SCHOOL",
      resourceId: schoolId,
      oldData: { status: school.status },
      newData: { status: updatedSchool.status },
      metadata: { 
        schoolName: school.name,
        changedBy: 'SUPER_ADMIN',
        affectedUsers: schoolUsers.length
      },
    },
  });

  const adminUsers = schoolUsers.filter(u => u.role === "SCHOOL_ADMIN");

  const statusMessages = {
    'ACTIVE': {
      title: '✅ School Approved!',
      message: `Your school "${school.name}" has been approved and is now ACTIVE. Please log in again to continue.`,
      type: 'success'
    },
    'REJECTED': {
      title: '❌ School Registration Rejected',
      message: `Your school "${school.name}" registration has been rejected. Please contact support for more information.`,
      type: 'error'
    },
    'SUSPENDED': {
      title: '⚠️ School Suspended',
      message: `Your school "${school.name}" has been suspended. Please contact support for more information.`,
      type: 'warning'
    },
    'DEACTIVATED': {
      title: '⚠️ School Deactivated',
      message: `Your school "${school.name}" has been deactivated. Please contact support for more information.`,
      type: 'warning'
    }
  };

  for (const user of adminUsers) {
    const message = statusMessages[status];
    if (message) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          title: message.title,
          message: message.message,
          type: message.type,
        }
      });
    }
  }

  const recipientEmails = new Set([school.email, ...adminUsers.map(u => u.email)]);
  for (const recipientEmail of recipientEmails) {
    try {
      await sendSchoolStatusEmail(recipientEmail, school.name, status);
    } catch (emailError) {
      console.warn('⚠️ School status email failed (non-blocking):', emailError.message);
    }
  }

  console.log(`[updateSchoolStatus] Successfully updated school ${school.name} to ${status}`);
  return updatedSchool;
};

// ── Super admin: delete/deactivate school ─────────────────────
const deleteSchool = async (schoolId, userId = null) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, status: true },
  });

  if (!school) throw createError("School not found", 404);

  console.log(`[deleteSchool] Deactivating school: ${school.name}`);

  const schoolUsers = await prisma.user.findMany({
    where: { schoolId },
    select: { id: true }
  });

  if (schoolUsers.length > 0) {
    const userIds = schoolUsers.map(u => u.id);
    const deletedTokens = await prisma.refreshToken.deleteMany({
      where: {
        userId: { in: userIds }
      }
    });
    console.log(`[AUTH] Invalidated ${deletedTokens.count} sessions for ${schoolUsers.length} users`);
  }

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: { 
      status: "DEACTIVATED",
      updatedAt: new Date()
    },
  });

  const adminUsers = await prisma.user.findMany({
    where: { schoolId, role: "SCHOOL_ADMIN" }
  });

  for (const u of adminUsers) {
    await prisma.notification.create({
      data: {
        userId: u.id,
        title: `School Account Deactivated`,
        message: `Your school account for ${school.name} has been deactivated by the system administrator. Please contact support for more information.`,
        type: "warning",
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      userId,
      action: "DELETE",
      resource: "SCHOOL",
      resourceId: schoolId,
      metadata: { 
        name: school.name, 
        previousStatus: school.status,
        newStatus: "DEACTIVATED" 
      },
    },
  });

  return { 
    id: updated.id, 
    name: updated.name, 
    status: updated.status,
    message: "School deactivated successfully" 
  };
};

// ── Super admin: restore a deactivated school ─────────────────
const restoreSchool = async (schoolId, userId = null) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, status: true },
  });

  if (!school) throw createError("School not found", 404);
  if (school.status !== "DEACTIVATED") {
    throw createError("This school is not deactivated", 400);
  }

  console.log(`[restoreSchool] Restoring school: ${school.name}`);

  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: { 
      status: "ACTIVE",
      updatedAt: new Date()
    },
  });

  try {
    const adminUsers = await prisma.user.findMany({
      where: { schoolId, role: "SCHOOL_ADMIN" }
    });

    for (const u of adminUsers) {
      await prisma.notification.create({
        data: {
          userId: u.id,
          title: `School Account Restored`,
          message: `Your school account for ${school.name} has been restored by the system administrator. Please log in again to continue.`,
          type: "success",
        }
      });
    }
  } catch (notifError) {
    console.warn('Notification creation failed:', notifError.message);
  }

  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: "ACTIVATE",
        resource: "SCHOOL",
        resourceId: schoolId,
        metadata: { 
          name: school.name, 
          previousStatus: school.status,
          newStatus: "ACTIVE",
          restored: true
        },
      },
    });
  } catch (auditError) {
    console.warn('Audit log creation failed:', auditError.message);
  }

  return { 
    id: updated.id, 
    name: updated.name, 
    status: updated.status,
    message: "School restored successfully" 
  };
};

// ── Super admin: generate registration PDF ────────────────────
const generateRegistrationPdf = async (schoolId, user) => {
  const PDFDocument = require('pdfkit');
  
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    include: {
      users: {
        where: { role: 'SCHOOL_ADMIN' },
        select: {
          email: true,
          staff: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
            }
          }
        }
      },
      _count: {
        select: { students: true, staff: true }
      }
    }
  });

  if (!school) {
    throw createError("School not found", 404);
  }

  const admin = school.users[0];
  const adminStaff = admin?.staff;

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const buffers = [];
  
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {});

  // Header with branding
  doc.rect(0, 0, doc.page.width, 80)
     .fill('#4F46E5');
  
  doc.fillColor('#FFFFFF')
     .fontSize(24)
     .font('Helvetica-Bold')
     .text('EduPortal', 50, 25);
  
  doc.fontSize(12)
     .font('Helvetica')
     .text('School Registration Document', 50, 52);

  doc.fillColor('#1F2937')
     .fontSize(20)
     .font('Helvetica-Bold')
     .text('REGISTRATION DETAILS', 50, 120);

  doc.moveTo(50, 145)
     .lineTo(550, 145)
     .stroke('#E5E7EB');

  let yPos = 165;
  
  const sections = [
    {
      title: '🏫 School Information',
      fields: [
        { label: 'School Name', value: school.name },
        { label: 'Email', value: school.email },
        { label: 'Phone', value: school.phone || 'Not provided' },
        { label: 'Region', value: school.region },
        { label: 'District', value: school.district },
        { label: 'Address', value: school.address || 'Not provided' },
        { label: 'Status', value: school.status },
        { label: 'Plan', value: school.plan },
      ]
    },
    {
      title: '👤 Admin Information',
      fields: [
        { label: 'Admin Name', value: adminStaff ? `${adminStaff.firstName} ${adminStaff.lastName}` : 'Not assigned' },
        { label: 'Admin Email', value: admin?.email || 'Not provided' },
        { label: 'Admin Phone', value: adminStaff?.phone || 'Not provided' },
      ]
    },
    {
      title: '📊 Statistics',
      fields: [
        { label: 'Total Students', value: school._count.students || 0 },
        { label: 'Total Staff', value: school._count.staff || 0 },
      ]
    }
  ];

  sections.forEach((section, index) => {
    doc.fillColor('#1F2937')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(section.title, 50, yPos);
    
    yPos += 22;

    section.fields.forEach(field => {
      doc.fillColor('#6B7280')
         .fontSize(11)
         .font('Helvetica')
         .text(`${field.label}:`, 50, yPos);
      
      doc.fillColor('#1F2937')
         .fontSize(11)
         .font('Helvetica-Bold')
         .text(String(field.value), 200, yPos);
      
      yPos += 20;
    });

    yPos += 15;

    if (yPos > 700 && index < sections.length - 1) {
      doc.addPage();
      yPos = 50;
    }
  });

  doc.addPage();
  
  doc.fillColor('#4F46E5')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('Document Information', 50, 50);

  doc.fillColor('#6B7280')
     .fontSize(11)
     .font('Helvetica')
     .text('This document is an official record of the school registration on EduPortal.', 50, 80);

  const footerFields = [
    { label: 'Document ID', value: `REG-${school.id.substring(0, 8).toUpperCase()}` },
    { label: 'Generated On', value: new Date().toLocaleString() },
    { label: 'Generated By', value: user?.email || 'System' },
  ];

  let fyPos = 120;
  footerFields.forEach(field => {
    doc.fillColor('#6B7280')
       .fontSize(11)
       .font('Helvetica')
       .text(`${field.label}:`, 50, fyPos);
    
    doc.fillColor('#1F2937')
       .fontSize(11)
       .font('Helvetica-Bold')
       .text(field.value, 200, fyPos);
    
    fyPos += 22;
  });

  doc.moveTo(50, fyPos + 10)
     .lineTo(550, fyPos + 10)
     .stroke('#E5E7EB');

  doc.fillColor('#9CA3AF')
     .fontSize(10)
     .font('Helvetica')
     .text(
       'This is a computer-generated document. No signature is required.',
       50,
       fyPos + 30,
       { align: 'center' }
     );

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve({
        pdfBuffer,
        filename: `${school.name.replace(/\s+/g, '_')}_Registration.pdf`
      });
    });
    doc.on('error', reject);
  });
};

module.exports = {
  registerSchool,
  manualCreateSchool,
  getSchoolProfile,
  updateSchoolProfile,
  updateSchoolById,
  updateSchoolPlan,
  getDashboardStats,
  getSuperAdminDashboard,
  getTerms,
  createTerm,
  updateTerm,
  updateTermStatus, // ✅ NEW
  getAllSchools,
  updateSchoolStatus,
  deleteSchool,
  restoreSchool,
  generateRegistrationPdf,
};