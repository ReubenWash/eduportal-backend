const express    = require("express");
const router     = express.Router();
const controller = require("../controllers/auth.controller");
const validate   = require("../middleware/validate");
const authenticate = require("../middleware/auth");
const { isSchoolAdmin, isSuperAdmin } = require("../middleware/roles");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
  changePasswordValidator,
  resendVerificationValidator,
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

// ─── NEW: Student self-service password reset ──────────────────
// POST /api/v1/auth/student-reset-password
router.post(
  "/student-reset-password",
  authLimiter,
  [
    body("studentNumber").trim().notEmpty().withMessage("Student number is required"),
    body("dateOfBirth").notEmpty().withMessage("Date of birth is required"),
    body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
  ],
  validate,
  controller.resetStudentPassword
);

// POST /api/v1/auth/verify-email
router.post(
  "/verify-email",
  verifyEmailValidator,
  validate,
  controller.verifyEmail
);

// POST /api/v1/auth/resend-verification
router.post(
  "/resend-verification",
  resendVerificationValidator,
  validate,
  controller.resendVerification
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

// ─── NEW: Admin routes (School Admin or Super Admin only) ─────

// POST /api/v1/auth/admin/reset-student-password/:studentId
router.post(
  "/admin/reset-student-password/:studentId",
  authenticate,
  (req, res, next) => {
    // Allow both SCHOOL_ADMIN and SUPER_ADMIN
    if (req.user.role === 'SCHOOL_ADMIN' || req.user.role === 'SUPER_ADMIN') {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin access required."
    });
  },
  controller.adminResetStudentPassword
);

// POST /api/v1/auth/admin/change-password/:userId
router.post(
  "/admin/change-password/:userId",
  authenticate,
  (req, res, next) => {
    // Allow both SCHOOL_ADMIN and SUPER_ADMIN
    if (req.user.role === 'SCHOOL_ADMIN' || req.user.role === 'SUPER_ADMIN') {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin access required."
    });
  },
  [
    body("newPassword").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  ],
  validate,
  controller.adminChangePassword
);

module.exports = router;