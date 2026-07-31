const { body, param } = require("express-validator");

const loginValidator = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email or student number is required.")
    .custom((value) => {
      // Allow either email format OR student number format
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isStudentNumber = /^STU\/\d{4}\/\d{4}$/.test(value.toUpperCase());
      if (!isEmail && !isStudentNumber) {
        throw new Error("Please enter a valid email address or student number (e.g., STU/2026/0001)");
      }
      return true;
    }),

  body("password")
    .notEmpty().withMessage("Password is required."),
];

const forgotPasswordValidator = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required.")
    .isEmail().withMessage("Please enter a valid email address.")
    .normalizeEmail(),
];

const resetPasswordValidator = [
  body("token")
    .trim()
    .notEmpty().withMessage("Reset token is required."),

  body("password")
    .notEmpty().withMessage("Password is required.")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[0-9]/).withMessage("Password must contain at least one number."),
];

const verifyEmailValidator = [
  body("code")
    .trim()
    .notEmpty().withMessage("Verification code is required.")
    .isLength({ min: 6, max: 6 }).withMessage("Verification code must be exactly 6 digits.")
    .isNumeric().withMessage("Verification code must be numeric."),
];

const resendVerificationValidator = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required.")
    .isEmail().withMessage("Please enter a valid email address.")
    .normalizeEmail(),
];

const changePasswordValidator = [
  body("currentPassword")
    .notEmpty().withMessage("Current password is required."),

  body("newPassword")
    .notEmpty().withMessage("New password is required.")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[0-9]/).withMessage("Password must contain at least one number."),
];

// ─── NEW: Student self-service password reset validator ──────
const studentResetPasswordValidator = [
  body("studentNumber")
    .trim()
    .notEmpty().withMessage("Student number is required.")
    .matches(/^STU\/\d{4}\/\d{4}$/).withMessage("Student number must be in format STU/YYYY/XXXX (e.g., STU/2026/0001)"),

  body("dateOfBirth")
    .notEmpty().withMessage("Date of birth is required.")
    .isISO8601().withMessage("Please enter a valid date of birth."),

  body("newPassword")
    .notEmpty().withMessage("New password is required.")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[0-9]/).withMessage("Password must contain at least one number."),

  body("confirmPassword")
    .notEmpty().withMessage("Please confirm your password.")
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
];

// ─── NEW: Admin reset student password validator ──────────────
const adminResetStudentPasswordValidator = [
  param("studentId")
    .notEmpty().withMessage("Student ID is required.")
    .isUUID().withMessage("Invalid student ID format."),
];

// ─── NEW: Admin change password validator ─────────────────────
const adminChangePasswordValidator = [
  param("userId")
    .notEmpty().withMessage("User ID is required.")
    .isUUID().withMessage("Invalid user ID format."),

  body("newPassword")
    .notEmpty().withMessage("New password is required.")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[0-9]/).withMessage("Password must contain at least one number."),
];

module.exports = {
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
  resendVerificationValidator,
  changePasswordValidator,
  studentResetPasswordValidator,    // ← NEW
  adminResetStudentPasswordValidator, // ← NEW
  adminChangePasswordValidator,     // ← NEW
};