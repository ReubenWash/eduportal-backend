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
    console.log('[Auth] No authorization header or invalid format');
    return sendError(res, 401, "Access token required.");
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify and decode the token
    const decoded = verifyAccessToken(token);
    console.log('[Auth] Token decoded:', { 
      userId: decoded.userId, 
      email: decoded.email,
      role: decoded.role,
      schoolId: decoded.schoolId 
    });
    
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
      console.log('[Auth] User not found for ID:', decoded.userId);
      return sendError(res, 401, "User not found.");
    }

    if (!user.isActive) {
      console.log('[Auth] User account deactivated:', user.email);
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

    console.log('[Auth] User authenticated successfully:', {
      userId: user.id,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId || 'No school assigned'
    });

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      console.log('[Auth] Token expired');
      return sendError(res, 401, "Access token has expired. Please refresh.");
    }
    if (err.name === "JsonWebTokenError") {
      console.log('[Auth] Invalid token:', err.message);
      return sendError(res, 401, "Invalid access token.");
    }
    console.error('[Auth] Unexpected error:', err);
    return sendError(res, 401, "Authentication failed.");
  }
};

module.exports = authenticate;