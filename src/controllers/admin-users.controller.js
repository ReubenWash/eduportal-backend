const { prisma } = require("../config/db");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const getAllUsers = async (req, res) => {
  const users = await prisma.user.findMany({
    include: {
      school: { select: { name: true } },
      staff: { select: { firstName: true, lastName: true } },
      studentProfile: { select: { firstName: true, lastName: true } },
      guardianProfile: { select: { firstName: true, lastName: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  const formatted = users.map(u => {
    let name = "Unknown";
    if (u.role === "SUPER_ADMIN") name = "Super Admin";
    else if (u.staff) name = `${u.staff.firstName} ${u.staff.lastName}`;
    else if (u.studentProfile) name = `${u.studentProfile.firstName} ${u.studentProfile.lastName}`;
    else if (u.guardianProfile) name = `${u.guardianProfile.firstName} ${u.guardianProfile.lastName}`;

    return {
      id: u.id,
      name,
      email: u.email,
      role: u.role,
      schoolId: u.schoolId || null,
      school: u.school?.name || "System",
      status: u.isActive ? "ACTIVE" : "SUSPENDED",
      joinedAt: u.createdAt
    };
  });

  sendSuccess(res, 200, "Users retrieved", formatted);
};

const addUser = async (req, res) => {
  // Only meant for staff/admin addition from super admin panel
  const { name, email, role, schoolName } = req.body;
  if (!name || !email || !role || !schoolName) throw createError("Missing fields", 400);

  const school = await prisma.school.findFirst({ where: { name: schoolName } });
  if (!school) throw createError("School not found", 404);

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw createError("User email already exists", 409);

  const tempPassword = crypto.randomBytes(6).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const [firstName, ...rest] = name.split(" ");
  const lastName = rest.join(" ") || " ";

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { schoolId: school.id, email, passwordHash, role, isVerified: true },
    });
    const staff = await tx.staff.create({
      data: {
        userId: user.id,
        schoolId: school.id,
        firstName,
        lastName
      },
    });
    return { user, staff };
  });

  // Not sending email here for brevity, just return the user
  sendSuccess(res, 201, "User created", {
    id: result.user.id,
    name,
    email: result.user.email,
    role: result.user.role,
    school: school.name,
    status: result.user.isActive ? "ACTIVE" : "SUSPENDED",
    joinedAt: result.user.createdAt
  });
};

const updateUserStatus = async (req, res) => {
  const { status } = req.body; // ACTIVE or SUSPENDED
  if (!["ACTIVE", "SUSPENDED"].includes(status)) throw createError("Invalid status", 400);

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: status === "ACTIVE" }
  });

  sendSuccess(res, 200, "User status updated", user);
};

const deleteUser = async (req, res) => {
  // A true delete is dangerous, usually we just deactivate, but per frontend req "removed from platform"
  await prisma.user.delete({ where: { id: req.params.id } });
  sendSuccess(res, 200, "User deleted", null);
};

// ─── NEW: Super Admin manually verify a user ───────────────────
const verifyUser = async (req, res) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError("User not found", 404);

  // If already verified, just return success
  if (user.isVerified) {
    return sendSuccess(res, 200, "User is already verified", { id: user.id, isVerified: true });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isVerified: true },
  });

  // Log the action in audit log
  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId || null,
      action: "UPDATE",
      resource: "USER",
      resourceId: userId,
      metadata: { action: "manual_verify", email: user.email },
    },
  });

  return sendSuccess(res, 200, "User verified successfully", {
    id: updated.id,
    isVerified: updated.isVerified,
  });
};

module.exports = {
  getAllUsers,
  addUser,
  updateUserStatus,
  deleteUser,
  verifyUser,   // ← exported
};