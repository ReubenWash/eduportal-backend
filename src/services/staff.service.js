const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");
const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { generateStaffNumber } = require("../utils/generateId");
const { sendWelcomeStaffEmail } = require("./email.service");
const { getPagination, paginatedResponse } = require("../utils/paginate");

const createStaff = async (schoolId, data, photoUrl) => {
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw createError("A user with this email already exists.", 409);

  const tempPassword = crypto.randomBytes(6).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const staffNumber  = await generateStaffNumber(schoolId);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { schoolId, email: data.email, passwordHash, role: data.role, isVerified: true },
    });
    const staff = await tx.staff.create({
      data: {
        userId:        user.id,
        schoolId,
        firstName:     data.firstName,
        lastName:      data.lastName,
        phone:         data.phone     || null,
        gender:        data.gender    || null,
        qualification: data.qualification || null,
        staffNumber,
        photoUrl:      photoUrl || null,
      },
    });
    return { user, staff };
  });

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  // Send welcome email non-blocking — staff is created regardless of email success
  try {
    await sendWelcomeStaffEmail(data.email, `${data.firstName} ${data.lastName}`, tempPassword, school?.name || 'Your School');
  } catch (emailErr) {
    console.error('[staff.service] Welcome email failed (non-blocking):', emailErr.message);
  }

  return result.staff;
};

const getStaff = async (schoolId, query) => {
  const { skip, take, page, limit } = getPagination(query);
  const where = { schoolId };
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName:  { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.role) where.user = { role: query.role };

  const [staff, total] = await Promise.all([
    prisma.staff.findMany({
      where, skip, take,
      orderBy: { firstName: "asc" },
      include: {
        user: { select: { role: true, email: true, isActive: true } },
        subjectAssignments: { include: { subject: { select: { name: true } } } },
      },
    }),
    prisma.staff.count({ where }),
  ]);

  return paginatedResponse(staff, total, page, limit);
};

const getStaffById = async (schoolId, staffId) => {
  const staff = await prisma.staff.findFirst({
    where: { id: staffId, schoolId },
    include: {
      user: { select: { role: true, email: true, lastLoginAt: true } },
      subjectAssignments: {
        include: {
          subject: { select: { name: true, code: true } },
        },
      },
      classesAsTeacher: { select: { id: true, level: true, section: true } },
    },
  });
  if (!staff) throw createError("Staff not found.", 404);
  return staff;
};

const updateStaff = async (schoolId, staffId, data, photoUrl) => {
  const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId } });
  if (!staff) throw createError("Staff not found.", 404);
  const updateData = { ...data };
  if (photoUrl) updateData.photoUrl = photoUrl;
  return prisma.staff.update({ where: { id: staffId }, data: updateData });
};

const deactivateStaff = async (schoolId, staffId) => {
  const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId }, include: { user: true } });
  if (!staff) throw createError("Staff not found.", 404);
  await prisma.user.update({ where: { id: staff.userId }, data: { isActive: false } });
  return { message: "Staff deactivated." };
};

const assignSubject = async (schoolId, staffId, subjectId, classId) => {
  const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId } });
  if (!staff) throw createError("Staff not found.", 404);
  return prisma.staffSubject.upsert({
    where:  { staffId_subjectId_classId: { staffId, subjectId, classId } },
    create: { staffId, subjectId, classId },
    update: {},
  });
};

const removeAssignment = async (schoolId, staffId, subjectId, classId) => {
  const staff = await prisma.staff.findFirst({ where: { id: staffId, schoolId } });
  if (!staff) throw createError("Staff not found.", 404);
  await prisma.staffSubject.delete({
    where: { staffId_subjectId_classId: { staffId, subjectId, classId } },
  });
  return { message: "Assignment removed." };
};

// ═══ NEW FUNCTIONS (appended) ═══

const bulkImportStaffFromExcelRows = async (schoolId, rows) => {
  let created = 0, skipped = 0;
  const failed = [];

  for (const row of rows) {
    try {
      // Build the data object expected by createStaff
      const email = String(row.email || "").trim();
      const firstName = String(row.firstName || "").trim();
      const lastName = String(row.lastName || "").trim();
      const role = String(row.role || "TEACHER").trim().toUpperCase();

      // Skip rows missing required fields
      if (!firstName || !lastName || !email) {
        skipped++;
        continue;
      }

      const staffData = {
        firstName,
        lastName,
        email,
        role,
        phone: row.phone ? String(row.phone).trim() : null,
        gender: row.gender ? String(row.gender).trim().toUpperCase() : null,
        qualification: row.qualification ? String(row.qualification).trim() : null,
      };

      // Call the existing createStaff function – this handles user creation,
      // staff number generation, password setup, and welcome email.
      await createStaff(schoolId, staffData, null);
      created++;
    } catch (err) {
      failed.push({ row, error: err.message });
    }
  }

  return { created, skipped, failed };
};

const getStaffForExport = async (schoolId, query) => {
  const where = { schoolId };
  if (query.status) where.user = { isActive: query.status === "ACTIVE" };
  if (query.role) where.user = { role: query.role };

  const staff = await prisma.staff.findMany({
    where,
    orderBy: { firstName: "asc" },
    include: {
      user: { select: { email: true, role: true, isActive: true } },
      subjectAssignments: {
        include: { subject: { select: { name: true } } },
      },
      classesAsTeacher: { select: { level: true, section: true } },
    },
  });

  return staff.map((s) => ({
    staffNumber: s.staffNumber,
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.user.email,
    role: s.user.role,
    phone: s.phone || "",
    gender: s.gender || "",
    qualification: s.qualification || "",
    subjects: s.subjectAssignments.map((sa) => sa.subject.name).join(", "),
    classes: s.classesAsTeacher.map((c) => `${c.level} ${c.section}`).join(", "),
    isActive: s.user.isActive ? "Active" : "Inactive",
  }));
};

// ═══ UPDATED EXPORTS (new functions added) ═══

module.exports = {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  deactivateStaff,
  assignSubject,
  removeAssignment,
  bulkImportStaffFromExcelRows,   // NEW
  getStaffForExport,              // NEW
};