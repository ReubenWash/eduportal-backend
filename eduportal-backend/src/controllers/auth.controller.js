const authService = require("../services/auth.service");
const { sendSuccess } = require("../utils/apiResponse");
const {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} = require("../utils/generateToken");

// POST /api/v1/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;

  const { accessToken, refreshToken, user } = await authService.login(email, password);

  setRefreshTokenCookie(res, refreshToken);

  return sendSuccess(res, 200, "Login successful.", { accessToken, user });
};

// POST /api/v1/auth/refresh
const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;

  const { accessToken, refreshToken } = await authService.refreshAccessToken(token);

  setRefreshTokenCookie(res, refreshToken);

  return sendSuccess(res, 200, "Token refreshed.", { accessToken });
};

// POST /api/v1/auth/logout
const logout = async (req, res) => {
  const token = req.cookies?.refreshToken;

  await authService.logout(token);
  clearRefreshTokenCookie(res);

  return sendSuccess(res, 200, "Logged out successfully.");
};

// POST /api/v1/auth/forgot-password
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  await authService.forgotPassword(email);

  // Always return success to prevent email enumeration
  return sendSuccess(
    res,
    200,
    "If an account with that email exists, a password reset link has been sent."
  );
};

// POST /api/v1/auth/reset-password
const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  await authService.resetPassword(token, password);

  return sendSuccess(res, 200, "Password reset successfully. Please log in.");
};

// POST /api/v1/auth/verify-email
const verifyEmail = async (req, res) => {
  const { code } = req.body;

  await authService.verifyEmail(code);

  return sendSuccess(res, 200, "Email verified successfully. You can now log in.");
};

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  const user = await authService.getMe(req.user.userId);
  return sendSuccess(res, 200, "Profile fetched.", user);
};

// PATCH /api/v1/auth/change-password
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(req.user.userId, currentPassword, newPassword);

  return sendSuccess(res, 200, "Password changed successfully.");
};

module.exports = {
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail,
  getMe,
  changePassword,
};
