const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");
const { getPagination, paginatedResponse } = require("../utils/paginate");
const { sendWelcomeGuardianEmail } = require("./email.service"); // Assuming we'll add this

const createGuardian = async (schoolId, data) => {
  let user = null;
  let tempPassword = null;
  
  const result = await prisma.$transaction(async (tx) => {
    if (data.email) {
      const exists = await tx.user.findUnique({ where: { email: data.email } });
      if (exists) throw createError("A user with this email already exists.", 409);
      
      tempPassword = crypto.randomBytes(6).toString("hex");
      const passwordHash = await bcrypt.hash(tempPassword, 12);
      
      user = await tx.user.create({
        data: {
          schoolId,
          email: data.email,
          passwordHash,
          role: "PARENT",
          isVerified: true,
          mustChangePassword: true,
        },
      });
    }

    const guardian = await tx.guardian.create({
      data: {
        schoolId,
        userId: user?.id || null,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        email: data.email || null,
        relationship: data.relationship,
      },
    });

    return guardian;
  });

  if (user && tempPassword) {
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
    // This will error if sendWelcomeGuardianEmail doesn't exist, we'll implement it next
    await sendWelcomeGuardianEmail(data.email, `${data.firstName} ${data.lastName}`, tempPassword, school.name);
  }

  return result;
};

const getGuardians = async (schoolId, query) => {
  const { skip, take, page, limit } = getPagination(query);
  const where = { schoolId };
  if (query.search) {
    where.OR = [
      { firstName: { contains: query.search, mode: "insensitive" } },
      { lastName:  { contains: query.search, mode: "insensitive" } },
      { phone:     { contains: query.search } },
    ];
  }
  const [guardians, total] = await Promise.all([
    prisma.guardian.findMany({ where, skip, take, orderBy: { firstName: "asc" }, include: { students: { include: { student: { select: { firstName: true, lastName: true, studentNumber: true } } } } } }),
    prisma.guardian.count({ where }),
  ]);
  return paginatedResponse(guardians, total, page, limit);
};

const getGuardianById = async (schoolId, guardianId) => {
  const g = await prisma.guardian.findFirst({ where: { id: guardianId, schoolId }, include: { students: { include: { student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } } } } } });
  if (!g) throw createError("Guardian not found.", 404);
  return g;
};

const updateGuardian = async (schoolId, guardianId, data) => {
  const g = await prisma.guardian.findFirst({ where: { id: guardianId, schoolId } });
  if (!g) throw createError("Guardian not found.", 404);
  return prisma.guardian.update({ where: { id: guardianId }, data });
};

const linkToStudent = async (schoolId, guardianId, studentId, isPrimary) => {
  const g = await prisma.guardian.findFirst({ where: { id: guardianId, schoolId } });
  if (!g) throw createError("Guardian not found.", 404);
  const s = await prisma.student.findFirst({ where: { id: studentId, schoolId } });
  if (!s) throw createError("Student not found.", 404);
  return prisma.studentGuardian.upsert({
    where:  { studentId_guardianId: { studentId, guardianId } },
    create: { studentId, guardianId, isPrimary: isPrimary || false },
    update: { isPrimary: isPrimary || false },
  });
};

module.exports = { createGuardian, getGuardians, getGuardianById, updateGuardian, linkToStudent };
