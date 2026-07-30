const { verifyAccessToken } = require("../utils/generateToken");
const { sendError } = require("../utils/apiResponse");
const { prisma } = require("../config/db");

/**
 * Verify JWT access token from Authorization header
 * Attaches full user object to req.user
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "Access token required.");
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify and decode the token
    const decoded = verifyAccessToken(token);
    
    // Fetch the full user from database to ensure we have all fields
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        role: true,
        schoolId: true,
        isActive: true,
        isVerified: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return sendError(res, 401, "User not found.");
    }

    if (!user.isActive) {
      return sendError(res, 403, "Account is deactivated. Please contact support.");
    }

    // Attach full user object to req.user
    req.user = {
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId,
      isActive: user.isActive,
      isVerified: user.isVerified,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return sendError(res, 401, "Access token has expired. Please refresh.");
    }
    if (err.name === "JsonWebTokenError") {
      return sendError(res, 401, "Invalid access token.");
    }
    console.error('Auth error:', err);
    return sendError(res, 401, "Authentication failed.");
  }
};

module.exports = authenticate;