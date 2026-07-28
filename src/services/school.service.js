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

  // ─── Send verification email (non-blocking) ──────────────────
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt   = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.refreshToken.create({
    data: {
      userId:    result.user.id,
      token:     `verify_${verificationCode}`,
      expiresAt,
    },
  });

  await prisma.notification.create({
    data: {
      userId:    result.user.id,
      title:     "Registration Under Review",
      message:   `Your registration for ${name} has been received and is currently under review.`,
      type:      "info",
    }
  });

  // ─── Try to send emails but don't fail registration if they fail ───
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
        status:    "ACTIVE", // Auto-activate for Super Admin creation
        plan:      plan      || "BASIC",
      },
    });

    const user = await tx.user.create({
      data: {
        schoolId:     school.id,
        email,
        passwordHash,
        role:         "SCHOOL_ADMIN",
        isVerified:   true, // Auto-verified
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

  // Only allow known, safe fields to be updated this way.
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

  // Keep the Subscription record in sync so billing/revenue stays accurate.
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
  const [
    totalStudents,
    totalStaff,
    totalClasses,
    activeTerm,
  ] = await Promise.all([
    prisma.student.count({ where: { schoolId, status: "ACTIVE" } }),
    prisma.staff.count({ where: { schoolId } }),
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

  if (user && user.role === 'CLASS_TEACHER' && user.staff?.id) {
    const staffClass = await prisma.class.findFirst({ where: { classTeacherId: user.staff.id } });
    if (staffClass) {
      const enrollments = await prisma.enrollment.findMany({
        where: { classId: staffClass.id, termId: activeTerm?.id },
        include: { student: true }
      });
      const today = new Date();
      today.setHours(0,0,0,0);
      const attendances = await prisma.attendance.findMany({
        where: { classId: staffClass.id, date: { gte: today } }
      });

      const classStudents = enrollments.map(e => ({
        id: e.student.id,
        name: `${e.student.firstName} ${e.student.lastName}`,
        studentNo: e.student.studentNumber,
        presentToday: attendances.some(a => a.studentId === e.student.id && a.status === 'PRESENT')
      }));

      return { ...baseStats, myClass: { name: staffClass.name, students: classStudents } };
    }
  }

  if (user && user.role === 'SUBJECT_TEACHER' && user.staff?.id) {
    const assignments = await prisma.staffSubject.findMany({
      where: { staffId: user.staff.id },
      include: { class: true, subject: true }
    });
    
    const myAssignments = assignments.map((a, i) => ({
      class: a.class.name,
      subject: a.subject.name,
      submitted: i % 2 === 0,
      date: i % 2 === 0 ? '12 Jun 2025' : null,
      students: 30
    }));

    return { ...baseStats, myAssignments };
  }

  return baseStats;
};

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
    // Exclude deactivated schools from total count
    prisma.school.count({ where: { status: { not: "DEACTIVATED" } } }),
    prisma.school.count({ where: { status: 'ACTIVE' } }),
    prisma.student.count({ where: { status: 'ACTIVE' } }),
    prisma.staff.count(),
    prisma.user.count({ where: { isVerified: true, role: { not: 'SUPER_ADMIN' } } }),
    prisma.school.count({ where: { status: 'PENDING' } }),
    // Exclude deactivated schools from recent activity
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
const getTerms = async (schoolId, academicYear) => {
  return prisma.term.findMany({
    where: {
      schoolId,
      ...(academicYear && { academicYear }),
    },
    orderBy: [{ academicYear: "desc" }, { termNumber: "asc" }],
  });
};

const createTerm = async (schoolId, data) => {
  // Ensure no duplicate term for same year + number
  const exists = await prisma.term.findFirst({
    where: {
      schoolId,
      academicYear: data.academicYear,
      termNumber:   data.termNumber,
    },
  });
  if (exists) throw createError(`${data.termNumber} for ${data.academicYear} already exists.`, 409);

  return prisma.term.create({
    data: { schoolId, ...data },
  });
};

const updateTerm = async (schoolId, termId, data) => {
  // If activating, deactivate all other terms first
  if (data.status === "ACTIVE") {
    await prisma.term.updateMany({
      where: { schoolId, status: "ACTIVE" },
      data:  { status: "COMPLETED" },
    });
  }

  return prisma.term.update({
    where: { id: termId },
    data,
  });
};

// ── Super admin: list all schools ─────────────────────────────
const getAllSchools = async (query) => {
  const { skip, take, page, limit } = getPagination(query);
  
  // Start with base filter to exclude deactivated schools
  const where = {
    status: { not: "DEACTIVATED" }
  };
  
  // If a specific status is requested, override the filter
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
  const updatedSchool = await prisma.school.update({
    where: { id: schoolId },
    data:  { status },
  });

  const adminUsers = await prisma.user.findMany({
    where: { schoolId, role: "SCHOOL_ADMIN" }
  });

  for (const u of adminUsers) {
    await prisma.notification.create({
      data: {
        userId:  u.id,
        title:   `School Status: ${status}`,
        message: status === "ACTIVE"
          ? `Your school account for ${updatedSchool.name} has been approved! You now have full access.`
          : status === "REJECTED"
          ? `Your registration for ${updatedSchool.name} has been rejected.`
          : `Your school account status has been updated to ${status}.`,
        type:    status === "ACTIVE" ? "success" : status === "REJECTED" ? "error" : "warning",
      }
    });
  }

  const recipientEmails = new Set([updatedSchool.email, ...adminUsers.map(u => u.email)]);
  for (const recipientEmail of recipientEmails) {
    try {
      await sendSchoolStatusEmail(recipientEmail, updatedSchool.name, status);
    } catch (emailError) {
      console.warn('⚠️ School status email failed (non-blocking):', emailError.message);
    }
  }

  return updatedSchool;
};

// ── Super admin: delete/deactivate school ─────────────────────
const deleteSchool = async (schoolId, userId = null) => {
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, status: true },
  });

  if (!school) throw createError("School not found", 404);

  // Soft delete - set status to DEACTIVATED
  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: { status: "DEACTIVATED" },
  });

  // Notify school admins
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

  // Log the action
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

  // Restore - set status back to ACTIVE
  const updated = await prisma.school.update({
    where: { id: schoolId },
    data: { status: "ACTIVE" },
  });

  // Notify school admins
  try {
    const adminUsers = await prisma.user.findMany({
      where: { schoolId, role: "SCHOOL_ADMIN" }
    });

    for (const u of adminUsers) {
      await prisma.notification.create({
        data: {
          userId: u.id,
          title: `School Account Restored`,
          message: `Your school account for ${school.name} has been restored by the system administrator. You can now access your account again.`,
          type: "success",
        }
      });
    }
  } catch (notifError) {
    console.warn('Notification creation failed:', notifError.message);
  }

  // Log the action - using "ACTIVATE" since "RESTORE" is not in the AuditAction enum
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
  
  // Fetch school with related data
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

  // Get the admin user
  const admin = school.users[0];
  const adminStaff = admin?.staff;

  // Create PDF document
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const buffers = [];
  
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    // PDF generation complete
  });

  // ─── PDF CONTENT ──────────────────────────────────────────────

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

  // Title
  doc.fillColor('#1F2937')
     .fontSize(20)
     .font('Helvetica-Bold')
     .text('REGISTRATION DETAILS', 50, 120);

  // Line separator
  doc.moveTo(50, 145)
     .lineTo(550, 145)
     .stroke('#E5E7EB');

  // ─── School Information ──────────────────────────────────────
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
    // Section title
    doc.fillColor('#1F2937')
       .fontSize(14)
       .font('Helvetica-Bold')
       .text(section.title, 50, yPos);
    
    yPos += 22;

    // Section fields
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

    // Add page break if needed
    if (yPos > 700 && index < sections.length - 1) {
      doc.addPage();
      yPos = 50;
    }
  });

  // ─── Footer ──────────────────────────────────────────────────
  doc.addPage();
  
  // Footer header
  doc.fillColor('#4F46E5')
     .fontSize(16)
     .font('Helvetica-Bold')
     .text('Document Information', 50, 50);

  doc.fillColor('#6B7280')
     .fontSize(11)
     .font('Helvetica')
     .text('This document is an official record of the school registration on EduPortal.', 50, 80);

  // Footer details
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

  // Footer line
  doc.moveTo(50, fyPos + 10)
     .lineTo(550, fyPos + 10)
     .stroke('#E5E7EB');

  // Footer text
  doc.fillColor('#9CA3AF')
     .fontSize(10)
     .font('Helvetica')
     .text(
       'This is a computer-generated document. No signature is required.',
       50,
       fyPos + 30,
       { align: 'center' }
     );

  // Finalize PDF
  doc.end();

  // Return PDF buffer
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
  getAllSchools,
  updateSchoolStatus,
  deleteSchool,
  restoreSchool,
  generateRegistrationPdf,
};