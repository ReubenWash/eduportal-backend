const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { prisma } = require("../config/db");

const isProd = process.env.NODE_ENV === "production";

/**
 * Sign a short-lived JWT access token
 * Payload contains userId, schoolId, email, and role
 */
const signAccessToken = (user) => {
  const payload = {
    userId: user.id,
    schoolId: user.schoolId || null,
    role: user.role,
    email: user.email,
  };
  
  console.log('[JWT] Signing access token for user:', {
    userId: user.id,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId || 'No school'
  });
  
  return jwt.sign(
    payload,
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "7d" }
  );
};

/**
 * Generate a refresh token, persist it to the database,
 * and return the raw token string (to be set as HTTP-only cookie)
 */
const generateRefreshToken = async (userId) => {
  const token = uuidv4(); // opaque random token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  console.log('[JWT] Generating refresh token for user:', userId);

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });

  return token;
};

/**
 * Verify a JWT access token — returns the decoded payload or throws
 */
const verifyAccessToken = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    console.log('[JWT] Token verified for user:', {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      schoolId: decoded.schoolId
    });
    return decoded;
  } catch (error) {
    console.error('[JWT] Token verification failed:', error.message);
    throw error;
  }
};

/**
 * Verify a refresh token — returns the stored token record or throws
 */
const verifyRefreshToken = async (token) => {
  console.log('[JWT] Verifying refresh token');
  
  const stored = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true }
  });

  if (!stored) {
    console.log('[JWT] Refresh token not found');
    throw new Error('Invalid refresh token');
  }

  if (stored.expiresAt < new Date()) {
    console.log('[JWT] Refresh token expired');
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw new Error('Refresh token expired');
  }

  console.log('[JWT] Refresh token verified for user:', stored.userId);
  return stored;
};

/**
 * Helper to set the refresh token as an HTTP-only secure cookie
 *
 * NOTE: Frontend (Vercel) and backend (Render) are on different domains,
 * which makes this a cross-site request. Cross-site cookies REQUIRE
 * `sameSite: "none"` + `secure: true` or the browser will silently refuse
 * to send/accept the cookie. `secure: true` only works over HTTPS, so we
 * fall back to `sameSite: "lax"` + `secure: false` in local dev (http://localhost).
 */
const setRefreshTokenCookie = (res, token) => {
  console.log('[JWT] Setting refresh token cookie, isProd:', isProd);
  
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: isProd,                  // must be true in production (HTTPS + sameSite=none requires it)
    sameSite: isProd ? "none" : "lax", // "none" required for cross-site (Vercel -> Render)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/',
    domain: isProd ? undefined : undefined // Let browser handle domain
  });
};

/**
 * Clear the refresh token cookie on logout
 */
const clearRefreshTokenCookie = (res) => {
  console.log('[JWT] Clearing refresh token cookie, isProd:', isProd);
  
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: '/'
  });
};

/**
 * Revoke all refresh tokens for a user (logout from all devices)
 */
const revokeAllRefreshTokens = async (userId) => {
  console.log('[JWT] Revoking all refresh tokens for user:', userId);
  
  const result = await prisma.refreshToken.deleteMany({
    where: { userId }
  });
  
  console.log('[JWT] Revoked', result.count, 'tokens');
  return result;
};

/**
 * Revoke a specific refresh token
 */
const revokeRefreshToken = async (token) => {
  console.log('[JWT] Revoking specific refresh token');
  
  const result = await prisma.refreshToken.delete({
    where: { token }
  });
  
  return result;
};

module.exports = {
  signAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  revokeAllRefreshTokens,
  revokeRefreshToken,
};