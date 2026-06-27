const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { prisma } = require("../config/db");

/**
 * Sign a short-lived JWT access token
 * Payload contains userId, schoolId, and role
 */
const signAccessToken = (user) => {
  return jwt.sign(
    {
      userId:   user.id,
      schoolId: user.schoolId || null,
      role:     user.role,
      email:    user.email,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m" }
  );
};

/**
 * Generate a refresh token, persist it to the database,
 * and return the raw token string (to be set as HTTP-only cookie)
 */
const generateRefreshToken = async (userId) => {
  const token     = uuidv4(); // opaque random token
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });

  return token;
};

/**
 * Verify a JWT access token — returns the decoded payload or throws
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

/**
 * Helper to set the refresh token as an HTTP-only secure cookie
 */
const setRefreshTokenCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

/**
 * Clear the refresh token cookie on logout
 */
const clearRefreshTokenCookie = (res) => {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  });
};

module.exports = {
  signAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};
