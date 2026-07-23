const express    = require("express");
const router     = express.Router();
const controller = require("../controllers/auth.controller");
const validate   = require("../middleware/validate");
const authenticate = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
  changePasswordValidator,
} = require("../validators/auth.validator");

// ── Public routes (no auth required) ──────────────────────────

// POST /api/v1/auth/login
router.post(
  "/login",
  authLimiter,
  loginValidator,
  validate,
  controller.login
);

// POST /api/v1/auth/refresh
router.post("/refresh", controller.refresh);

// POST /api/v1/auth/logout
router.post("/logout", controller.logout);

// POST /api/v1/auth/forgot-password
router.post(
  "/forgot-password",
  authLimiter,
  forgotPasswordValidator,
  validate,
  controller.forgotPassword
);

// POST /api/v1/auth/reset-password
router.post(
  "/reset-password",
  resetPasswordValidator,
  validate,
  controller.resetPassword
);

// POST /api/v1/auth/verify-email
router.post(
  "/verify-email",
  verifyEmailValidator,
  validate,
  controller.verifyEmail
);

// ── Protected routes (auth required) ──────────────────────────

// GET /api/v1/auth/me
router.get("/me", authenticate, controller.getMe);

// PATCH /api/v1/auth/change-password
router.patch(
  "/change-password",
  authenticate,
  changePasswordValidator,
  validate,
  controller.changePassword
);

module.exports = router;
