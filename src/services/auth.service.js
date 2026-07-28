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
const login = async (email, password) => {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email },
        { studentProfile: { studentNumber: email.toUpperCase() } }
      ]
    },
    include: {
      staff:          { select: { firstName: true, lastName: true, photoUrl: true } },
      studentProfile: { select: { firstName: true, lastName: true, photoUrl: true, studentNumber: true } },
      guardianProfile: { select: { firstName: true, lastName: true } },
      school:          { select: { status: true } }
    },
  });

  if (!user || !user.isActive) throw createError("Invalid email or password.", 401);

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) throw createError("Invalid email or password.", 401);

  if (!user.isVerified) throw createError("Please verify your email address before logging in.", 403);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Fire-and-forget: don't let audit logging break the login flow.
  prisma.auditLog.create({
    data: { userId: user.id, schoolId: user.schoolId, action: "LOGIN", resource: "USER", resourceId: user.id },
  }).catch(() => {});

  const accessToken  = signAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  const profile = user.staff || user.studentProfile || user.guardianProfile || null;

  return {
    accessToken,
    refreshToken,
    user: {
      id:       user.id,
      email:    user.studentProfile ? user.studentProfile.studentNumber : user.email,
      role:     user.role,
      schoolId: user.schoolId,
      schoolStatus: user.school?.status,
      name:     profile ? `${profile.firstName} ${profile.lastName}` : user.email,
      photoUrl: profile?.photoUrl || null,
      mustChangePassword: user.mustChangePassword,
    },
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

  const newAccessToken  = signAccessToken(stored.user);
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  const newRefreshToken = await generateRefreshToken(stored.user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

// ── Logout ─────────────────────────────────────────────────────
const logout = async (token) => {
  if (!token) return;
  // Only delete non-prefixed tokens (actual session tokens, not verify/reset)
  await prisma.refreshToken.deleteMany({
    where: { token, NOT: [{ token: { startsWith: "verify_" } }, { token: { startsWith: "reset_" } }] },
  });
};

// ── Forgot password ────────────────────────────────────────────
const forgotPassword = async (email) => {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always return silently — prevents email enumeration attacks
  if (!user) return;

  // Delete any existing reset tokens for this user
  await prisma.refreshToken.deleteMany({
    where: { userId: user.id, token: { startsWith: "reset_" } },
  });

  const rawToken  = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store hashed token with a "reset_" prefix in the refreshToken table
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

// ── Reset password ─────────────────────────────────────────────
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

  // Invalidate reset token AND all active session tokens
  await prisma.refreshToken.deleteMany({ where: { userId: stored.userId } });
};

// ── Verify email with 6-digit code ────────────────────────────
const verifyEmail = async (code) => {
  // Find the verification token with the code
  const stored = await prisma.refreshToken.findFirst({
    where: { 
      token: `verify_${code}`,
      expiresAt: { gt: new Date() } // Only valid if not expired
    },
    include: { user: true }
  });

  if (!stored) {
    // Check if the code exists but expired
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

  // Check if user is already verified
  if (stored.user.isVerified) {
    // Delete the used token
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    return { success: true, message: "Email already verified" };
  }

  // Update user as verified
  await prisma.user.update({
    where: { id: stored.userId },
    data: { isVerified: true },
  });

  // Delete the used token
  await prisma.refreshToken.delete({ where: { id: stored.id } });
  
  // Also delete any other verification tokens for this user
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
      id: true, email: true, role: true, schoolId: true,
      isVerified: true, lastLoginAt: true, createdAt: true,
      staff: {
        select: {
          id: true, firstName: true, lastName: true,
          phone: true, photoUrl: true, qualification: true, staffNumber: true,
        },
      },
      studentProfile: {
        select: { id: true, firstName: true, lastName: true, studentNumber: true, photoUrl: true },
      },
      school: {
        select: { id: true, name: true, logoUrl: true, plan: true, status: true },
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

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });

  // Force re-login on all other devices
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

  // Delete any existing verification tokens for this user
  await prisma.refreshToken.deleteMany({
    where: { 
      userId: user.id,
      token: { startsWith: 'verify_' }
    },
  });

  // Generate new 6-digit verification code
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Store the verification code
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: `verify_${verificationCode}`,
      expiresAt,
    },
  });

  // Send the verification email
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
  verifyEmail,
  getMe,
  changePassword,
  resendVerificationCode, // ← Added
};