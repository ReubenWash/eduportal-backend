const { body, param, query } = require("express-validator");

const registerSchoolValidator = [
  body("name")
    .trim().notEmpty().withMessage("School name is required.")
    .isLength({ min: 3, max: 100 }).withMessage("School name must be 3–100 characters."),

  body("email")
    .trim().notEmpty().withMessage("Email is required.")
    .isEmail().withMessage("Enter a valid email address.")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required.")
    .isLength({ min: 8 }).withMessage("Password must be at least 8 characters.")
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter.")
    .matches(/[0-9]/).withMessage("Password must contain at least one number."),

  body("region")
    .trim().notEmpty().withMessage("Region is required."),

  body("district")
    .trim().notEmpty().withMessage("District is required."),

  body("headmasterName")
    .trim().notEmpty().withMessage("Headmaster name is required."),

  body("plan")
    .optional()
    .isIn(["BASIC", "STANDARD", "PREMIUM"]).withMessage("Invalid plan selected."),
];

const updateSchoolValidator = [
  body("name")
    .optional().trim()
    .isLength({ min: 3, max: 100 }).withMessage("School name must be 3–100 characters."),

  body("phone")
    .optional().trim()
    .isMobilePhone().withMessage("Enter a valid phone number."),

  body("email")
    .optional().trim()
    .isEmail().withMessage("Enter a valid email address."),

  body("motto")
    .optional().trim()
    .isLength({ max: 200 }).withMessage("Motto cannot exceed 200 characters."),

  body("scoreLabels")
    .optional()
    .isObject().withMessage("Score labels must be an object."),
];

const createTermValidator = [
  body("academicYear")
    .trim().notEmpty().withMessage("Academic year is required.")
    .matches(/^\d{4}\/\d{4}$/).withMessage("Academic year must be in format YYYY/YYYY (e.g. 2024/2025)."),

  body("termNumber")
    .notEmpty().withMessage("Term number is required.")
    .isIn(["TERM1", "TERM2", "TERM3"]).withMessage("Term number must be TERM1, TERM2, or TERM3."),

  body("startDate")
    .notEmpty().withMessage("Start date is required.")
    .isISO8601().withMessage("Start date must be a valid date."),

  body("endDate")
    .notEmpty().withMessage("End date is required.")
    .isISO8601().withMessage("End date must be a valid date.")
    .custom((endDate, { req }) => {
      if (new Date(endDate) <= new Date(req.body.startDate)) {
        throw new Error("End date must be after start date.");
      }
      return true;
    }),

  body("nextTermDate")
    .optional()
    .isISO8601().withMessage("Next term date must be a valid date."),
];

const updateTermValidator = [
  param("id").notEmpty().withMessage("Term ID is required."),
  body("status")
    .optional()
    .isIn(["UPCOMING", "ACTIVE", "COMPLETED"]).withMessage("Invalid term status."),
  body("startDate").optional().isISO8601().withMessage("Start date must be a valid date."),
  body("endDate").optional().isISO8601().withMessage("End date must be a valid date."),
];

const updateSchoolStatusValidator = [
  param("id").notEmpty().withMessage("School ID is required."),
  body("status")
    .notEmpty().withMessage("Status is required.")
    .isIn(["ACTIVE", "SUSPENDED", "DEACTIVATED", "REJECTED"]).withMessage("Invalid status."),
];

module.exports = {
  registerSchoolValidator,
  updateSchoolValidator,
  createTermValidator,
  updateTermValidator,
  updateSchoolStatusValidator,
};
