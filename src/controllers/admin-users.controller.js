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
      isVerified: u.isVerified,
      joinedAt: u.createdAt
    };
  });

  sendSuccess(res, 200, "Users retrieved", formatted);
};

// ─── GET USER BY ID ────────────────────────────────────────────
const getUserById = async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      school: { select: { id: true, name: true, status: true } },
      staff: { select: { firstName: true, lastName: true, phone: true, photoUrl: true } },
      studentProfile: { select: { firstName: true, lastName: true, studentNumber: true } },
      guardianProfile: { select: { firstName: true, lastName: true, phone: true } }
    }
  });

  if (!user) {
    throw createError("User not found", 404);
  }

  let name = "Unknown";
  if (user.role === "SUPER_ADMIN") name = "Super Admin";
  else if (user.staff) name = `${user.staff.firstName} ${user.staff.lastName}`;
  else if (user.studentProfile) name = `${user.studentProfile.firstName} ${user.studentProfile.lastName}`;
  else if (user.guardianProfile) name = `${user.guardianProfile.firstName} ${user.guardianProfile.lastName}`;

  return sendSuccess(res, 200, "User retrieved", {
    id: user.id,
    name,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
    school: user.school,
    isVerified: user.isVerified,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt
  });
};

// ─── ADD USER - SUPPORT BOTH SCHOOL ID AND NAME ──────────────
const addUser = async (req, res) => {
  const { name, email, role, schoolName } = req.body;
  
  console.log("📝 Add user request:", { name, email, role, schoolName });

  if (!name || !email || !role || !schoolName) {
    return res.status(400).json({
      success: false,
      message: "Missing fields: name, email, role, and schoolName are required"
    });
  }

  // Find school - support both ID, name, and slug
  let school = await prisma.school.findFirst({
    where: {
      OR: [
        { id: schoolName },
        { name: schoolName },
        { slug: schoolName }
      ]
    }
  });

  if (!school) {
    // Try to find by name with case-insensitive search
    school = await prisma.school.findFirst({
      where: {
        name: {
          contains: schoolName,
          mode: 'insensitive'
        }
      }
    });
  }

  if (!school) {
    console.log("❌ School not found for:", schoolName);
    // Return available schools for debugging
    const availableSchools = await prisma.school.findMany({
      select: { id: true, name: true, slug: true },
      take: 10
    });
    console.log("Available schools (first 10):", availableSchools);
    
    return res.status(404).json({
      success: false,
      message: `School "${schoolName}" not found. Please select a valid school.`,
      availableSchools: availableSchools
    });
  }

  console.log("✅ Found school:", school.name, school.id);

  // Check if user already exists
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return res.status(409).json({
      success: false,
      message: "User email already exists"
    });
  }

  const tempPassword = crypto.randomBytes(6).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const [firstName, ...rest] = name.split(" ");
  const lastName = rest.join(" ") || " ";

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { 
        schoolId: school.id, 
        email, 
        passwordHash, 
        role, 
        isVerified: true 
      },
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
    isVerified: result.user.isVerified,
    joinedAt: result.user.createdAt
  });
};

// ─── UPDATE USER ──────────────────────────────────────────────
const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, role, isActive, schoolId } = req.body;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      staff: true,
      studentProfile: true,
      guardianProfile: true
    }
  });

  if (!user) {
    throw createError("User not found", 404);
  }

  // Update user
  const updatedUser = await prisma.user.update({
    where: { id },
    data: {
      email: email || user.email,
      role: role || user.role,
      isActive: isActive !== undefined ? isActive : user.isActive,
      schoolId: schoolId || user.schoolId
    }
  });

  // Update profile based on role
  if (name && user.staff) {
    const [firstName, ...rest] = name.split(" ");
    await prisma.staff.update({
      where: { userId: id },
      data: {
        firstName: firstName || user.staff.firstName,
        lastName: rest.join(" ") || user.staff.lastName
      }
    });
  }

  // Log the action
  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId || null,
      action: "UPDATE",
      resource: "USER",
      resourceId: id,
      metadata: { changes: req.body }
    }
  });

  return sendSuccess(res, 200, "User updated successfully", updatedUser);
};

// ─── UPDATE USER STATUS ──────────────────────────────────────
const updateUserStatus = async (req, res) => {
  const { status } = req.body;
  if (!["ACTIVE", "SUSPENDED"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status. Must be ACTIVE or SUSPENDED"
    });
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: status === "ACTIVE" }
  });

  // Log the action
  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId || null,
      action: "UPDATE",
      resource: "USER",
      resourceId: req.params.id,
      metadata: { newStatus: status }
    }
  });

  sendSuccess(res, 200, "User status updated", user);
};

// ─── DELETE USER WITH PROPER RESPONSE ────────────────────────
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
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Prevent deleting the last SUPER_ADMIN
    if (user.role === "SUPER_ADMIN") {
      const superAdminCount = await prisma.user.count({
        where: { role: "SUPER_ADMIN" }
      });
      if (superAdminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete the last Super Admin"
        });
      }
    }

    // Delete related records in correct order
    await prisma.$transaction(async (tx) => {
      // 1. Delete staff FIRST
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

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
      data: { id: userId, deleted: true }
    });

  } catch (error) {
    console.error("Delete user error:", error);
    
    // Try to deactivate instead
    try {
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isActive: false }
      });
      return res.status(200).json({
        success: true,
        message: "User deactivated successfully (could not fully delete)",
        data: { id: userId, deactivated: true }
      });
    } catch (fallbackError) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete user: " + error.message
      });
    }
  }
};

// ─── VERIFY A SINGLE USER ─────────────────────────────────────
const verifyUser = async (req, res) => {
  const { userId } = req.params;
  
  const user = await prisma.user.findUnique({ 
    where: { id: userId },
    include: {
      school: { select: { name: true } }
    }
  });
  
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }

  if (user.isVerified) {
    return sendSuccess(res, 200, "User is already verified", { 
      id: user.id, 
      isVerified: true,
      email: user.email
    });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { 
      isVerified: true,
      verificationCode: null,
      verificationCodeExpiresAt: null
    },
  });

  // Create notification
  await prisma.notification.create({
    data: {
      userId: userId,
      title: "✅ Email Verified",
      message: `Your email (${user.email}) has been verified by the administrator. You can now log in.`,
      type: "success"
    }
  });

  // Log the action
  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId || null,
      action: "UPDATE",
      resource: "USER",
      resourceId: userId,
      metadata: { 
        action: "manual_verify", 
        email: user.email,
        school: user.school?.name
      },
    },
  });

  return sendSuccess(res, 200, "User verified successfully", {
    id: updated.id,
    email: updated.email,
    isVerified: updated.isVerified,
  });
};

// ─── VERIFY ALL USERS IN A SCHOOL ─────────────────────────────
const verifyAllUsersBySchool = async (req, res) => {
  const { schoolId } = req.params;

  // Check if school exists
  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true }
  });

  if (!school) {
    return res.status(404).json({
      success: false,
      message: "School not found"
    });
  }

  // Get all unverified users in the school
  const unverifiedUsers = await prisma.user.findMany({
    where: {
      schoolId: schoolId,
      isVerified: false
    },
    select: {
      id: true,
      email: true,
      role: true
    }
  });

  if (unverifiedUsers.length === 0) {
    return sendSuccess(res, 200, "All users in this school are already verified", {
      school: school.name,
      verifiedCount: 0,
      totalUsers: await prisma.user.count({ where: { schoolId } })
    });
  }

  // Update all unverified users
  const updated = await prisma.user.updateMany({
    where: {
      schoolId: schoolId,
      isVerified: false
    },
    data: {
      isVerified: true,
      verificationCode: null,
      verificationCodeExpiresAt: null
    }
  });

  // Create notifications for verified users
  for (const user of unverifiedUsers) {
    await prisma.notification.create({
      data: {
        userId: user.id,
        title: "✅ Email Verified",
        message: `Your email (${user.email}) has been verified by the administrator. You can now log in.`,
        type: "success"
      }
    });
  }

  // Log the action
  await prisma.auditLog.create({
    data: {
      userId: req.user?.userId || null,
      action: "UPDATE",
      resource: "USER",
      metadata: { 
        action: "bulk_verify",
        schoolId: schoolId,
        schoolName: school.name,
        usersVerified: updated.count
      },
    },
  });

  return sendSuccess(res, 200, `Verified ${updated.count} users in ${school.name}`, {
    school: {
      id: school.id,
      name: school.name
    },
    verifiedCount: updated.count,
    totalUsers: await prisma.user.count({ where: { schoolId } })
  });
};

module.exports = {
  getAllUsers,
  getUserById,
  addUser,
  updateUser,
  updateUserStatus,
  deleteUser,
  verifyUser,
  verifyAllUsersBySchool,
};