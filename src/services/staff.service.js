const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { prisma } = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { generateStaffNumber } = require("../utils/generateId");
const { sendWelcomeStaffEmail } = require("./email.service");
const { getPagination, paginatedResponse } = require("../utils/paginate");

const createStaff = async (schoolId, data, photoUrl) => {
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw createError("A user with this email already exists.", 409);

  const tempPassword = crypto.randomBytes(6).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const staffNumber = await generateStaffNumber(schoolId);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { 
        schoolId, 
        email: data.email, 
        passwordHash, 
        role: data.role, 
        isVerified: true 
      },
    });
    const staff = await tx.staff.create({
      data: {
        userId: user.id,
        schoolId,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        gender: data.gender || null,
        qualification: data.qualification || null,
        staffNumber,
        photoUrl: photoUrl || null,
      },
    });
    return { user, staff };
  });

  const school = await prisma.school.findUnique({ 
    where: { id: schoolId }, 
    select: { name: true } 
  });

  // Send welcome email non-blocking
  try {
    await sendWelcomeStaffEmail(
      data.email, 
      `${data.firstName} ${data.lastName}`, 
      tempPassword, 
      school?.name || 'Your School'
    );
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
      { lastName: { contains: query.search, mode: "insensitive" } },
    ];
  }
  if (query.role) where.user = { role: query.role };

  const [staff, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      skip,
      take,
      orderBy: { firstName: "asc" },
      include: {
        user: { select: { role: true, email: true, isActive: true } },
        subjectAssignments: { 
          include: { 
            subject: { select: { name: true, code: true } } 
          } 
        },
        classesAsTeacher: { 
          select: { id: true, level: true, section: true } 
        },
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
      user: { select: { role: true, email: true, lastLoginAt: true, isActive: true } },
      subjectAssignments: {
        include: {
          subject: { select: { name: true, code: true } },
          class: { select: { level: true, section: true } },
        },
      },
      classesAsTeacher: { select: { id: true, level: true, section: true } },
    },
  });
  if (!staff) throw createError("Staff not found.", 404);
  return staff;
};

const updateStaff = async (schoolId, staffId, data, photoUrl) => {
  const staff = await prisma.staff.findFirst({ 
    where: { id: staffId, schoolId } 
  });
  if (!staff) throw createError("Staff not found.", 404);
  
  // Check if email is being updated and if it's already taken
  if (data.email && data.email !== staff.user?.email) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });
    if (existingUser) {
      throw createError("A user with this email already exists.", 409);
    }
  }
  
  const updateData = { ...data };
  if (photoUrl) updateData.photoUrl = photoUrl;
  
  return prisma.staff.update({ 
    where: { id: staffId }, 
    data: updateData 
  });
};

const deactivateStaff = async (schoolId, staffId) => {
  const staff = await prisma.staff.findFirst({ 
    where: { id: staffId, schoolId }, 
    include: { user: true } 
  });
  if (!staff) throw createError("Staff not found.", 404);
  
  await prisma.user.update({ 
    where: { id: staff.userId }, 
    data: { isActive: false } 
  });
  return { message: "Staff deactivated." };
};

const assignSubject = async (schoolId, staffId, subjectId, classId) => {
  const staff = await prisma.staff.findFirst({ 
    where: { id: staffId, schoolId } 
  });
  if (!staff) throw createError("Staff not found.", 404);
  
  // Check if subject exists in the school
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, schoolId }
  });
  if (!subject) throw createError("Subject not found in this school.", 404);
  
  // Check if class exists in the school
  const classExists = await prisma.class.findFirst({
    where: { id: classId, schoolId }
  });
  if (!classExists) throw createError("Class not found in this school.", 404);

  return prisma.staffSubject.upsert({
    where: { 
      staffId_subjectId_classId: { 
        staffId, 
        subjectId, 
        classId 
      } 
    },
    create: { staffId, subjectId, classId },
    update: {},
  });
};

const removeAssignment = async (schoolId, staffId, subjectId, classId) => {
  const staff = await prisma.staff.findFirst({ 
    where: { id: staffId, schoolId } 
  });
  if (!staff) throw createError("Staff not found.", 404);

  await prisma.staffSubject.delete({
    where: { 
      staffId_subjectId_classId: { 
        staffId, 
        subjectId, 
        classId 
      } 
    },
  });
  return { message: "Assignment removed." };
};

// ─── Bulk Import from Excel ───
const bulkImportStaffFromExcelRows = async (schoolId, rows) => {
  let created = 0, skipped = 0;
  const failed = [];

  for (const row of rows) {
    try {
      const email = String(row.email || "").trim();
      const firstName = String(row.firstName || "").trim();
      const lastName = String(row.lastName || "").trim();
      const role = String(row.role || "SUBJECT_TEACHER").trim().toUpperCase();

      // Skip rows missing required fields
      if (!firstName || !lastName || !email) {
        skipped++;
        continue;
      }

      // Validate role
      const validRoles = ["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"];
      if (!validRoles.includes(role)) {
        failed.push({ row, error: `Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}` });
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

      await createStaff(schoolId, staffData, null);
      created++;
    } catch (err) {
      failed.push({ row, error: err.message });
    }
  }

  return { created, skipped, failed };
};

// ─── Export Staff for Excel ───
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

// ─── Get All Staff (Super Admin) ───
const getAllStaff = async (query = {}) => {
  try {
    const { page = 1, limit = 20, search, role, schoolId } = query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = {};
    if (role) where.user = { role };
    if (schoolId) where.schoolId = schoolId;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
              isVerified: true
            }
          },
          school: {
            select: {
              id: true,
              name: true
            }
          },
          subjectAssignments: {
            include: { 
              subject: { select: { name: true, code: true } },
              class: { select: { level: true, section: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.staff.count({ where })
    ]);

    return {
      data: staff,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    };
  } catch (error) {
    console.error('[staff.service] getAllStaff error:', error);
    throw error;
  }
};

// ─── Get Staff by School (Super Admin) ───
const getStaffBySchool = async (schoolId, query = {}) => {
  try {
    const { page = 1, limit = 20, search, role } = query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where = { schoolId };
    if (role) where.user = { role };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
              isActive: true,
            }
          },
          subjectAssignments: {
            include: {
              subject: { select: { name: true, code: true } },
              class: { select: { level: true, section: true } }
            }
          },
          classesAsTeacher: {
            select: { id: true, level: true, section: true }
          }
        },
        orderBy: { firstName: 'asc' }
      }),
      prisma.staff.count({ where })
    ]);

    return {
      data: staff,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    };
  } catch (error) {
    console.error('[staff.service] getStaffBySchool error:', error);
    throw error;
  }
};

// ─── EXPORTS ───
module.exports = {
  createStaff,
  getStaff,
  getStaffById,
  updateStaff,
  deactivateStaff,
  assignSubject,
  removeAssignment,
  bulkImportStaffFromExcelRows,
  getStaffForExport,
  getAllStaff,
  getStaffBySchool, // ✅ NEW
};