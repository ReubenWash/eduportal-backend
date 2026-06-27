const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { prisma }  = require("../config/db");
const { generateSchoolSlug } = require("../utils/generateId");
const { sendVerificationEmail, sendRegistrationUnderReviewEmail, sendSchoolStatusEmail } = require("./email.service");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");

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

  // Send verification email
  const verifyToken = crypto.randomBytes(32).toString("hex");
  const expiresAt   = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await prisma.refreshToken.create({
    data: {
      userId:    result.user.id,
      token:     `verify_${verifyToken}`,
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

  await sendVerificationEmail(email, headmasterName, verifyToken);
  await sendRegistrationUnderReviewEmail(email, headmasterName, name);

  return {
    id:     result.school.id,
    name:   result.school.name,
    slug:   result.school.slug,
    status: result.school.status,
  };
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

// ── Dashboard stats ────────────────────────────────────────────
const getDashboardStats = async (schoolId) => {
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

  return { totalStudents, totalStaff, totalClasses, activeTerm, passRate };
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
  const where = {};
  if (query.status) where.status = query.status;
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
    await sendSchoolStatusEmail(recipientEmail, updatedSchool.name, status);
  }

  return updatedSchool;
};

module.exports = {
  registerSchool,
  getSchoolProfile,
  updateSchoolProfile,
  getDashboardStats,
  getTerms,
  createTerm,
  updateTerm,
  getAllSchools,
  updateSchoolStatus,
};
