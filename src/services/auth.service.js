const bcrypt  = require("bcryptjs");
const crypto  = require("crypto");
const { prisma } = require("../config/db");
const {
  signAccessToken,
  generateRefreshToken,
} = require("../utils/generateToken");
const { sendVerificationEmail, sendPasswordResetEmail } = require("./email.service");
const { createError } = require("../middleware/errorHandler");

// ── Login ──────────────────────────────────────────────────────
const login = async (identifier, password) => {
  // identifier can be email OR student number
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: identifier },
        { studentProfile: { studentNumber: identifier.toUpperCase() } },
        { studentProfile: { studentNumber: identifier } }
      ]
    },
    include: {
      staff: {
        select: { 
          id: true, // ✅ Include staff ID
          firstName: true, 
          lastName: true, 
          photoUrl: true 
        } 
      },
      studentProfile: { 
        select: { 
          id: true,
          firstName: true, 
          lastName: true, 
          photoUrl: true, 
          studentNumber: true 
        } 
      },
      guardianProfile: { 
        select: { 
          id: true,
          firstName: true, 
          lastName: true 
        } 
      },
      school: { 
        select: { 
          id: true, 
          status: true, 
          name: true 
        } 
      }
    },
  });

  if (!user || !user.isActive) {
    throw createError("Invalid email/student number or password.", 401);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw createError("Invalid email/student number or password.", 401);
  }

  if (!user.isVerified) {
    throw createError("Please verify your email address before logging in.", 403);
  }

  // ─── Check school status if user belongs to a school ───
  if (user.schoolId) {
    const school = await prisma.school.findUnique({
      where: { id: user.schoolId },
      select: { status: true, name: true }
    });

    if (!school) {
      throw createError("School not found. Please contact support.", 403);
    }

    if (school.status !== 'ACTIVE') {
      const statusMessages = {
        'PENDING': 'Your school registration is pending approval. Please wait for administrator verification.',
        'SUSPENDED': 'Your school account has been suspended. Please contact support for assistance.',
        'DEACTIVATED': 'Your school account has been deactivated. Please contact support for assistance.',
        'REJECTED': 'Your school registration has been rejected. Please contact support for more information.'
      };
      
      const message = statusMessages[school.status] || 'School is not verified. Please contact support.';
      throw createError(message, 403);
    }
  }

  await prisma.user.update({ 
    where: { id: user.id }, 
    data: { lastLoginAt: new Date() } 
  });

  // Fire-and-forget audit log
  prisma.auditLog.create({
    data: { 
      userId: user.id, 
      schoolId: user.schoolId, 
      action: "LOGIN", 
      resource: "USER", 
      resourceId: user.id 
    },
  }).catch(() => {});

  const accessToken  = signAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  // ✅ Get the profile (staff, student, or guardian)
  const profile = user.staff || user.studentProfile || user.guardianProfile || null;

  // ✅ Determine login identifier for display
  const loginIdentifier = user.studentProfile?.studentNumber || user.email;

  // ✅ Build the user object with all necessary data
  const userData = {
    id: user.id,
    email: user.email,
    loginIdentifier: loginIdentifier,
    role: user.role,
    schoolId: user.schoolId,
    schoolStatus: user.school?.status || 'UNKNOWN',
    schoolName: user.school?.name || null,
    name: profile ? `${profile.firstName} ${profile.lastName}` : user.email,
    photoUrl: profile?.photoUrl || null,
    mustChangePassword: user.mustChangePassword,
    studentNumber: user.studentProfile?.studentNumber || null,
    // ✅ Include staff data if the user is a staff member
    staff: user.staff || null,
    // ✅ Include student data if the user is a student
    student: user.studentProfile || null,
    // ✅ Include guardian data if the user is a guardian
    guardian: user.guardianProfile || null,
  };

  return {
    accessToken,
    refreshToken,
    user: userData,
  };
};

// ── Refresh access token ───────────────────────────────────────
const refreshAccessToken = async (token) => {
  if (!token) throw createError("Refresh token required.", 401);

  const stored = await prisma.refreshToken.findUnique({
    where:   { token },
    include: { user: true },
  });

  if (!stored) throw createError("Invalid refresh token.", 401);
  if (new Date() > stored.expiresAt) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw createError("Refresh token has expired. Please log in again.", 401);
  }
  if (!stored.user.isActive) throw createError("Account is deactivated.", 403);

  // ─── Check school status on token refresh ───
  if (stored.user.schoolId) {
    const school = await prisma.school.findUnique({
      where: { id: stored.user.schoolId },
      select: { status: true }
    });

    if (!school || school.status !== 'ACTIVE') {
      await prisma.refreshToken.delete({ where: { id: stored.id } });
      throw createError("Your school account is not active. Please contact support.", 403);
    }
  }

  const newAccessToken  = signAccessToken(stored.user);
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const newRefreshToken = await generateRefreshToken(stored.user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

// ── Logout ─────────────────────────────────────────────────────
const logout = async (token) => {
  if (!token) return;
  await prisma.refreshToken.deleteMany({
    where: { 
      token, 
      NOT: [
        { token: { startsWith: "verify_" } }, 
        { token: { startsWith: "reset_" } }
      ] 
    },
  });
};

// ── Forgot password (for users with email) ────────────────────
const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, token: { startsWith: "reset_" } },
  });

  const rawToken  = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId:    user.id,
      token:     `reset_${tokenHash}`,
      expiresAt,
    },
  });

  const profile = await prisma.staff.findUnique({
    where:  { userId: user.id },
    select: { firstName: true },
  });

  await sendPasswordResetEmail(email, profile?.firstName || "User", rawToken);
};

// ── Reset password (for users with email) ─────────────────────
const resetPassword = async (rawToken, newPassword) => {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const stored = await prisma.refreshToken.findFirst({
    where:   { token: `reset_${tokenHash}` },
    include: { user: true },
  });

  if (!stored) throw createError("Invalid or expired reset token.", 400);

  if (new Date() > stored.expiresAt) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw createError("Reset token has expired. Please request a new one.", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: stored.userId },
    data:  { passwordHash, mustChangePassword: false },
  });

  await prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
};

// ─── Reset student password by student number ────────────────
const resetStudentPassword = async (studentNumber, dateOfBirth, newPassword) => {
  const student = await prisma.student.findFirst({
    where: {
      studentNumber: studentNumber.toUpperCase(),
      dateOfBirth: new Date(dateOfBirth),
    },
    include: { user: true }
  });

  if (!student) {
    throw createError("Student not found. Please verify your student number and date of birth.", 404);
  }

  if (!student.user) {
    throw createError("Student account not found. Please contact support.", 404);
  }

  if (newPassword.length < 6) {
    throw createError("Password must be at least 6 characters.", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: student.userId },
    data: {
      passwordHash: passwordHash,
      mustChangePassword: false,
    }
  });

  await prisma.refreshToken.deleteMany({
    where: { userId: student.userId }
  });

  await prisma.auditLog.create({
    data: {
      userId: student.userId,
      action: 'PASSWORD_RESET',
      resource: 'USER',
      resourceId: student.userId,
      metadata: { 
        method: 'student_self_reset',
        studentNumber: student.studentNumber
      }
    }
  });

  return { 
    success: true, 
    message: "Password reset successfully. Please log in with your new password." 
  };
};

// ─── Admin reset student password ────────────────────────────
const adminResetStudentPassword = async (schoolId, studentId) => {
  const student = await prisma.student.findFirst({
    where: { id: studentId, schoolId },
    include: { user: true }
  });

  if (!student) {
    throw createError("Student not found.", 404);
  }

  const tempPassword = crypto.randomBytes(6).toString('hex').toUpperCase();
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  await prisma.user.update({
    where: { id: student.userId },
    data: {
      passwordHash: passwordHash,
      mustChangePassword: true,
    }
  });

  await prisma.refreshToken.deleteMany({
    where: { userId: student.userId }
  });

  await prisma.auditLog.create({
    data: {
      userId: student.userId,
      action: 'PASSWORD_RESET',
      resource: 'USER',
      resourceId: student.userId,
      metadata: { 
        method: 'admin_reset',
        studentNumber: student.studentNumber
      }
    }
  });

  return {
    success: true,
    tempPassword: tempPassword,
    studentNumber: student.studentNumber,
    message: "Password reset successfully. Student must change password on next login."
  };
};

// ─── Admin change password without current password ──────────
const adminChangePassword = async (userId, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError("User not found.", 404);

  if (newPassword.length < 6) {
    throw createError("Password must be at least 6 characters.", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: passwordHash,
      mustChangePassword: true,
    }
  });

  await prisma.refreshToken.deleteMany({
    where: { userId: userId }
  });

  return { success: true, message: "Password changed successfully." };
};

// ── Verify email with 6-digit code ────────────────────────────
const verifyEmail = async (code) => {
  const stored = await prisma.refreshToken.findFirst({
    where: { 
      token: `verify_${code}`,
      expiresAt: { gt: new Date() }
    },
    include: { user: true }
  });

  if (!stored) {
    const expired = await prisma.refreshToken.findFirst({
      where: { 
        token: `verify_${code}`,
        expiresAt: { lte: new Date() }
      },
    });
    
    if (expired) {
      throw createError("Verification code has expired. Please request a new one.", 400);
    }
    
    throw createError("Invalid verification code.", 400);
  }

  if (stored.user.isVerified) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    return { success: true, message: "Email already verified" };
  }

  await prisma.user.update({
    where: { id: stored.userId },
    data: { isVerified: true },
  });

  await prisma.refreshToken.delete({ where: { id: stored.id } });
  
  await prisma.refreshToken.deleteMany({
    where: { 
      userId: stored.userId,
      token: { startsWith: 'verify_' }
    },
  });

  return { success: true, message: "Email verified successfully" };
};

// ── Get current user ───────────────────────────────────────────
const getMe = async (userId) => {
  const user = await prisma.user.findUnique({
    where:  { id: userId },
    select: {
      id: true, 
      email: true, 
      role: true, 
      schoolId: true,
      isVerified: true, 
      lastLoginAt: true, 
      createdAt: true,
      mustChangePassword: true,
      staff: {
        select: {
          id: true, 
          firstName: true, 
          lastName: true,
          phone: true, 
          photoUrl: true, 
          qualification: true, 
          staffNumber: true,
        },
      },
      studentProfile: {
        select: { 
          id: true, 
          firstName: true, 
          lastName: true, 
          studentNumber: true, 
          photoUrl: true 
        },
      },
      guardianProfile: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        }
      },
      school: {
        select: { 
          id: true, 
          name: true, 
          logoUrl: true, 
          plan: true, 
          status: true 
        },
      },
    },
  });

  if (!user) throw createError("User not found.", 404);
  return user;
};

// ── Change password ────────────────────────────────────────────
const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createError("User not found.", 404);

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) throw createError("Current password is incorrect.", 400);

  if (newPassword.length < 6) {
    throw createError("Password must be at least 6 characters.", 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ 
    where: { id: userId }, 
    data: { passwordHash, mustChangePassword: false } 
  });

  await prisma.refreshToken.deleteMany({ where: { userId } });
};

// ── Resend verification code ──────────────────────────────────
const resendVerificationCode = async (email) => {
  const user = await prisma.user.findUnique({ 
    where: { email },
    include: {
      staff: { select: { firstName: true } }
    }
  });
  
  if (!user) throw createError("User not found.", 404);
  if (user.isVerified) throw createError("Email is already verified.", 400);

  await prisma.refreshToken.deleteMany({
    where: { 
      userId: user.id,
      token: { startsWith: 'verify_' }
    },
  });

  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: `verify_${verificationCode}`,
      expiresAt,
    },
  });

  const name = user.staff?.firstName || "User";
  await sendVerificationEmail(email, name, verificationCode);

  return { success: true, message: "Verification code sent successfully" };
};

module.exports = {
  login,
  refreshAccessToken,
  logout,
  forgotPassword,
  resetPassword,
  resetStudentPassword,
  adminResetStudentPassword,
  adminChangePassword,
  verifyEmail,
  getMe,
  changePassword,
  resendVerificationCode,
};