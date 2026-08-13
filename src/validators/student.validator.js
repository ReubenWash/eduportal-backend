// src/validators/student.validator.js
const { body, param, query } = require("express-validator");

// ─── Admit Student Validator ───
const admitStudentValidator = [
  // Student fields - Required
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required.")
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters."),
  
  body("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required.")
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters."),
  
  body("gender")
    .isIn(["MALE", "FEMALE"])
    .withMessage("Gender must be MALE or FEMALE."),
  
  body("dateOfBirth")
    .notEmpty()
    .withMessage("Date of birth is required.")
    .isISO8601()
    .withMessage("Date of birth must be a valid date (YYYY-MM-DD).")
    .custom((value) => {
      const dob = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      if (age < 5 || age > 20) {
        throw new Error("Student age must be between 5 and 20 years.");
      }
      return true;
    }),
  
  body("classId")
    .notEmpty()
    .withMessage("Class ID is required.")
    .isUUID()
    .withMessage("Invalid class ID format."),
  
  body("studentNumber")
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Student number must be between 3 and 20 characters."),
  
  body("otherNames")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Other names cannot exceed 50 characters."),
  
  body("status")
    .optional()
    .isIn(["ACTIVE", "GRADUATED", "TRANSFERRED", "WITHDRAWN", "REPEATED"])
    .withMessage("Invalid student status."),

  // ─── Guardian Fields - Optional (for auto-creation) ───
  body("guardianName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Guardian name must be between 2 and 100 characters."),
  
  body("guardianFirstName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Guardian first name must be between 2 and 50 characters."),
  
  body("guardianLastName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Guardian last name must be between 2 and 50 characters."),
  
  body("guardianEmail")
    .optional()
    .trim()
    .isEmail()
    .withMessage("Please provide a valid guardian email address.")
    .normalizeEmail(),
  
  body("guardianPhone")
    .optional()
    .trim()
    .isMobilePhone()
    .withMessage("Please provide a valid phone number."),
  
  body("guardianRelationship")
    .optional()
    .trim()
    .isIn(["Father", "Mother", "Guardian", "Sibling", "Other"])
    .withMessage("Relationship must be: Father, Mother, Guardian, Sibling, or Other."),
  
  // ─── Alias support (for backward compatibility) ───
  body("relationship")
    .optional()
    .trim()
    .isIn(["Father", "Mother", "Guardian", "Sibling", "Other"])
    .withMessage("Relationship must be: Father, Mother, Guardian, Sibling, or Other."),
  
  body("guardian")
    .optional()
    .isObject()
    .withMessage("Guardian must be an object."),
  
  // ─── Custom validation: If guardianEmail is provided, require at least name ───
  body().custom((value) => {
    if (value.guardianEmail && !value.guardianName && !value.guardianFirstName) {
      throw new Error("Guardian name is required when providing guardian email.");
    }
    return true;
  }),
];

// ─── Update Student Validator ───
const updateStudentValidator = [
  param("id")
    .notEmpty()
    .withMessage("Student ID is required.")
    .isUUID()
    .withMessage("Invalid student ID format."),
  
  // Student fields - Optional
  body("firstName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("First name cannot be empty.")
    .isLength({ min: 2, max: 50 })
    .withMessage("First name must be between 2 and 50 characters."),
  
  body("lastName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Last name cannot be empty.")
    .isLength({ min: 2, max: 50 })
    .withMessage("Last name must be between 2 and 50 characters."),
  
  body("gender")
    .optional()
    .isIn(["MALE", "FEMALE"])
    .withMessage("Gender must be MALE or FEMALE."),
  
  body("dateOfBirth")
    .optional()
    .isISO8601()
    .withMessage("Date of birth must be a valid date (YYYY-MM-DD)."),
  
  body("classId")
    .optional()
    .isUUID()
    .withMessage("Invalid class ID format."),
  
  body("studentNumber")
    .optional()
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage("Student number must be between 3 and 20 characters."),
  
  body("otherNames")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Other names cannot exceed 50 characters."),
  
  body("status")
    .optional()
    .isIn(["ACTIVE", "GRADUATED", "TRANSFERRED", "WITHDRAWN", "REPEATED"])
    .withMessage("Invalid student status."),
  
  body("photoUrl")
    .optional()
    .isURL()
    .withMessage("Photo URL must be a valid URL."),

  // ─── Guardian Fields - Optional ───
  body("guardianName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Guardian name must be between 2 and 100 characters."),
  
  body("guardianFirstName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Guardian first name must be between 2 and 50 characters."),
  
  body("guardianLastName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Guardian last name must be between 2 and 50 characters."),
  
  body("guardianEmail")
    .optional()
    .trim()
    .isEmail()
    .withMessage("Please provide a valid guardian email address.")
    .normalizeEmail(),
  
  body("guardianPhone")
    .optional()
    .trim()
    .isMobilePhone()
    .withMessage("Please provide a valid phone number."),
  
  body("guardianRelationship")
    .optional()
    .trim()
    .isIn(["Father", "Mother", "Guardian", "Sibling", "Other"])
    .withMessage("Relationship must be: Father, Mother, Guardian, Sibling, or Other."),
  
  body("relationship")
    .optional()
    .trim()
    .isIn(["Father", "Mother", "Guardian", "Sibling", "Other"])
    .withMessage("Relationship must be: Father, Mother, Guardian, Sibling, or Other."),
];

// ─── Transfer Student Validator ───
const transferValidator = [
  param("id")
    .notEmpty()
    .withMessage("Student ID is required.")
    .isUUID()
    .withMessage("Invalid student ID format."),
  
  body("destinationSchool")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Destination school must be between 2 and 100 characters."),
  
  body("transferDate")
    .optional()
    .isISO8601()
    .withMessage("Transfer date must be a valid date."),
  
  body("reason")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Reason cannot exceed 500 characters."),
];

// ─── Link Guardian Validator ───
const linkGuardianValidator = [
  param("studentId")
    .notEmpty()
    .withMessage("Student ID is required.")
    .isUUID()
    .withMessage("Invalid student ID format."),
  
  body("guardianEmail")
    .trim()
    .notEmpty()
    .withMessage("Guardian email is required.")
    .isEmail()
    .withMessage("Please provide a valid guardian email address.")
    .normalizeEmail(),
  
  body("isPrimary")
    .optional()
    .isBoolean()
    .withMessage("isPrimary must be a boolean value."),
];

// ─── Resend Guardian Credentials Validator ───
const resendGuardianCredentialsValidator = [
  param("guardianId")
    .notEmpty()
    .withMessage("Guardian ID is required.")
    .isUUID()
    .withMessage("Invalid guardian ID format."),
];

// ─── Get Students Query Validator ───
const getStudentsQueryValidator = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer."),
  
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100."),
  
  query("search")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search term must be between 1 and 100 characters."),
  
  query("status")
    .optional()
    .isIn(["ACTIVE", "GRADUATED", "TRANSFERRED", "WITHDRAWN", "REPEATED"])
    .withMessage("Invalid status filter."),
  
  query("classId")
    .optional()
    .isUUID()
    .withMessage("Invalid class ID format."),
  
  query("level")
    .optional()
    .isIn(["JHS1", "JHS2", "JHS3"])
    .withMessage("Level must be JHS1, JHS2, or JHS3."),
  
  query("gender")
    .optional()
    .isIn(["MALE", "FEMALE"])
    .withMessage("Gender must be MALE or FEMALE."),
];

// ─── Bulk Import Validator ───
const bulkImportValidator = [
  body("records")
    .isArray({ min: 1 })
    .withMessage("Records must be a non-empty array."),
  
  body("records.*.firstName")
    .trim()
    .notEmpty()
    .withMessage("Each record must have a firstName."),
  
  body("records.*.lastName")
    .trim()
    .notEmpty()
    .withMessage("Each record must have a lastName."),
  
  body("records.*.gender")
    .isIn(["MALE", "FEMALE"])
    .withMessage("Each record must have a valid gender."),
  
  body("records.*.dateOfBirth")
    .notEmpty()
    .withMessage("Each record must have a dateOfBirth.")
    .isISO8601()
    .withMessage("Each record must have a valid dateOfBirth."),
];

module.exports = {
  // Existing
  admitStudentValidator,
  updateStudentValidator,
  transferValidator,
  
  // New
  linkGuardianValidator,
  resendGuardianCredentialsValidator,
  getStudentsQueryValidator,
  bulkImportValidator,
};