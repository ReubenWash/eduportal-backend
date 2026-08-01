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

// ✅ FIX: Made all fields optional with better validation
const updateSchoolValidator = [
  body("name")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("School name must be 2–100 characters."),

  body("phone")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 5, max: 20 })
    .withMessage("Phone number must be 5–20 characters."),

  body("email")
    .optional({ values: "falsy" })
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),

  body("address")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 200 })
    .withMessage("Address cannot exceed 200 characters."),

  body("motto")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ max: 200 })
    .withMessage("Motto cannot exceed 200 characters."),

  body("logoUrl")
    .optional({ values: "falsy" })
    .isURL()
    .withMessage("Logo URL must be a valid URL."),

  body("scoreLabels")
    .optional({ values: "falsy" })
    .isObject()
    .withMessage("Score labels must be an object."),

  // ✅ Allow region and district to be optional during update
  body("region")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Region must be 2–100 characters."),

  body("district")
    .optional({ values: "falsy" })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("District must be 2–100 characters."),

  // ✅ Allow plan to be optional during update
  body("plan")
    .optional({ values: "falsy" })
    .isIn(["BASIC", "STANDARD", "PREMIUM"])
    .withMessage("Invalid plan selected."),

  body("status")
    .optional({ values: "falsy" })
    .isIn(["ACTIVE", "PENDING", "SUSPENDED", "DEACTIVATED", "REJECTED"])
    .withMessage("Invalid status."),
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
  body("academicYear")
    .optional()
    .matches(/^\d{4}\/\d{4}$/).withMessage("Academic year must be in format YYYY/YYYY (e.g. 2024/2025)."),
  body("termNumber")
    .optional()
    .isIn(["TERM1", "TERM2", "TERM3"]).withMessage("Term number must be TERM1, TERM2, or TERM3."),
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