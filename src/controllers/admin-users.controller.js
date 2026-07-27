// backend/controllers/admin-users.controller.js
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

// ─── FIXED: DELETE USER WITH PROPER ORDER ─────────────────────
const deleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        staff: true,
        studentProfile: true,
        guardianProfile: true,
      }
    });

    if (!user) {
      return sendSuccess(res, 404, "User not found", null);
    }

    // Prevent deleting the last SUPER_ADMIN
    if (user.role === "SUPER_ADMIN") {
      const superAdminCount = await prisma.user.count({
        where: { role: "SUPER_ADMIN" }
      });
      if (superAdminCount <= 1) {
        return sendSuccess(res, 400, "Cannot delete the last Super Admin", null);
      }
    }

    // Delete related records in correct order
    await prisma.$transaction(async (tx) => {
      // 1. Delete staff FIRST (this was the blocker)
      if (user.staff) {
        await tx.staff.delete({ where: { userId: userId } });
      }
      // 2. Delete student profile if exists
      if (user.studentProfile) {
        await tx.student.delete({ where: { userId: userId } });
      }
      // 3. Delete guardian profile if exists
      if (user.guardianProfile) {
        await tx.guardian.delete({ where: { userId: userId } });
      }
      // 4. Delete refresh tokens
      await tx.refreshToken.deleteMany({ where: { userId: userId } });
      // 5. Delete notifications
      await tx.notification.deleteMany({ where: { userId: userId } });
      // 6. Delete device tokens
      await tx.deviceToken.deleteMany({ where: { userId: userId } });
      // 7. Delete two factor auth if exists
      await tx.twoFactorAuth.deleteMany({ where: { userId: userId } });
      // 8. Finally delete the user
      await tx.user.delete({ where: { id: userId } });
    });

    // Log the action (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          userId: req.user?.userId || null,
          action: "DELETE",
          resource: "USER",
          resourceId: userId,
          metadata: { email: user.email, role: user.role }
        }
      });
    } catch (logError) {
      // Ignore audit log errors
    }

    sendSuccess(res, 200, "User deleted successfully", { id: userId, deleted: true });
  } catch (error) {
    console.error("Delete user error:", error);
    
    // If the above fails, try a simpler approach - just deactivate the user
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: false }
      });
      sendSuccess(res, 200, "User deactivated successfully (could not fully delete)", { 
        id: userId, 
        deactivated: true 
      });
    } catch (fallbackError) {
      sendSuccess(res, 500, "Failed to delete user: " + error.message, null);
    }
  }
};

// ─── NEW: Super Admin manually verify a user ───────────────────
const verifyUser = async (req, res) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError("User not found", 404);

  if (user.isVerified) {
    return sendSuccess(res, 200, "User is already verified", { id: user.id, isVerified: true });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isVerified: true },
  });

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
  verifyUser,
};