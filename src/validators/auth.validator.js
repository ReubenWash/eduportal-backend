const { body, param } = require("express-validator");

const loginValidator = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required.")
    .isEmail().withMessage("Please enter a valid email address.")
    .normalizeEmail(),

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

module.exports = {
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
  resendVerificationValidator,
  changePasswordValidator,
};