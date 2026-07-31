const authService = require("../services/auth.service");
const { sendSuccess } = require("../utils/apiResponse");
const { createError } = require("../middleware/errorHandler");
const {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} = require("../utils/generateToken");

// POST /api/v1/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw createError("Email/Student number and password are required", 400);
    }

    const { accessToken, refreshToken, user } = await authService.login(email, password);

    setRefreshTokenCookie(res, refreshToken);

    return sendSuccess(res, 200, "Login successful.", { accessToken, user });
  } catch (error) {
    console.error('Login error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again."
    });
  }
};

// POST /api/v1/auth/refresh
const refresh = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      throw createError("Refresh token required", 401);
    }

    const { accessToken, refreshToken } = await authService.refreshAccessToken(token);

    setRefreshTokenCookie(res, refreshToken);

    return sendSuccess(res, 200, "Token refreshed.", { accessToken });
  } catch (error) {
    console.error('Refresh error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to refresh token."
    });
  }
};

// POST /api/v1/auth/logout
const logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;

    await authService.logout(token);
    clearRefreshTokenCookie(res);

    return sendSuccess(res, 200, "Logged out successfully.");
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to logout."
    });
  }
};

// POST /api/v1/auth/forgot-password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw createError("Email is required", 400);
    }

    await authService.forgotPassword(email);

    // Always return success to prevent email enumeration
    return sendSuccess(
      res,
      200,
      "If an account with that email exists, a password reset link has been sent."
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to process request."
    });
  }
};

// POST /api/v1/auth/reset-password
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      throw createError("Token and password are required", 400);
    }

    await authService.resetPassword(token, password);

    return sendSuccess(res, 200, "Password reset successfully. Please log in.");
  } catch (error) {
    console.error('Reset password error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to reset password."
    });
  }
};

// ─── NEW: Student self-service password reset ──────────────────
// POST /api/v1/auth/student-reset-password
const resetStudentPassword = async (req, res) => {
  try {
    const { studentNumber, dateOfBirth, newPassword } = req.body;

    if (!studentNumber || !dateOfBirth || !newPassword) {
      throw createError("Student number, date of birth, and new password are required", 400);
    }

    const result = await authService.resetStudentPassword(studentNumber, dateOfBirth, newPassword);

    return sendSuccess(res, 200, result.message, result);
  } catch (error) {
    console.error('Student reset password error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password."
    });
  }
};

// ─── NEW: Admin reset student password ─────────────────────────
// POST /api/v1/auth/admin/reset-student-password/:studentId
const adminResetStudentPassword = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId) {
      throw createError("Student ID is required", 400);
    }

    // Check if user is School Admin or Super Admin
    if (!req.user || !req.user.schoolId) {
      throw createError("Unauthorized. School admin access required.", 403);
    }

    const result = await authService.adminResetStudentPassword(req.user.schoolId, studentId);

    return sendSuccess(res, 200, result.message, {
      tempPassword: result.tempPassword,
      studentNumber: result.studentNumber
    });
  } catch (error) {
    console.error('Admin reset student password error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reset password."
    });
  }
};

// ─── NEW: Admin change password for any user ───────────────────
// POST /api/v1/auth/admin/change-password/:userId
const adminChangePassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!userId || !newPassword) {
      throw createError("User ID and new password are required", 400);
    }

    // Check if user is School Admin or Super Admin
    if (!req.user || !req.user.schoolId) {
      throw createError("Unauthorized. School admin access required.", 403);
    }

    const result = await authService.adminChangePassword(userId, newPassword);

    return sendSuccess(res, 200, result.message, result);
  } catch (error) {
    console.error('Admin change password error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to change password."
    });
  }
};

// POST /api/v1/auth/verify-email
const verifyEmail = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      throw createError("Verification code is required", 400);
    }

    const result = await authService.verifyEmail(code);

    return sendSuccess(res, 200, result.message, result);
  } catch (error) {
    console.error('Verify email error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to verify email."
    });
  }
};

// POST /api/v1/auth/resend-verification
const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw createError("Email is required", 400);
    }

    const result = await authService.resendVerificationCode(email);

    return sendSuccess(res, 200, result.message, result);
  } catch (error) {
    console.error('Resend verification error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to resend verification code."
    });
  }
};

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  try {
    const user = await authService.getMe(req.user.userId);
    return sendSuccess(res, 200, "Profile fetched.", user);
  } catch (error) {
    console.error('Get me error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to fetch profile."
    });
  }
};

// PATCH /api/v1/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw createError("Current password and new password are required", 400);
    }

    await authService.changePassword(req.user.userId, currentPassword, newPassword);

    return sendSuccess(res, 200, "Password changed successfully.");
  } catch (error) {
    console.error('Change password error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to change password."
    });
  }
};

module.exports = {
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  resetStudentPassword,      // ← NEW
  adminResetStudentPassword, // ← NEW
  adminChangePassword,       // ← NEW
  verifyEmail,
  resendVerification,
  getMe,
  changePassword,
};