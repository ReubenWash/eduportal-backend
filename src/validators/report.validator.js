const { body, param, query } = require("express-validator");

// ─── Generate Report Validator ───
const generateReportValidator = [
  body("termId")
    .notEmpty().withMessage("Term ID is required.")
    .isUUID().withMessage("Invalid term ID format."),
  
  body("studentId")
    .optional()
    .isUUID().withMessage("Invalid student ID format."),
  
  body("classId")
    .optional()
    .isUUID().withMessage("Invalid class ID format."),
  
  body().custom((value, { req }) => {
    if (!req.body.studentId && !req.body.classId) {
      throw new Error("Either studentId or classId is required.");
    }
    return true;
  }),
];

// ─── Update Remarks Validator ───
// Any of these can be sent on its own; an empty string clears the field.
const REMARK_KEYS = ["teacherRemark", "headRemark", "attitude", "conduct", "interest", "promotedTo"];

const updateRemarksValidator = [
  param("id")
    .notEmpty().withMessage("Report ID is required.")
    .isUUID().withMessage("Invalid report ID format."),

  body("teacherRemark")
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage("Teacher remark cannot exceed 500 characters."),

  body("headRemark")
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage("Head remark cannot exceed 500 characters."),

  body("attitude")
    .optional()
    .trim()
    .isLength({ max: 80 }).withMessage("Attitude cannot exceed 80 characters."),

  body("conduct")
    .optional()
    .trim()
    .isLength({ max: 80 }).withMessage("Conduct cannot exceed 80 characters."),

  body("interest")
    .optional()
    .trim()
    .isLength({ max: 80 }).withMessage("Interest cannot exceed 80 characters."),

  body("promotedTo")
    .optional()
    .trim()
    .isLength({ max: 40 }).withMessage("Promoted to cannot exceed 40 characters."),

  body().custom((value) => {
    if (!REMARK_KEYS.some((k) => value && value[k] !== undefined)) {
      throw new Error("At least one remark field is required.");
    }
    return true;
  }),
];

// ─── Bulk Release Validator ───
const bulkReleaseValidator = [
  body("classId")
    .notEmpty().withMessage("Class ID is required.")
    .isUUID().withMessage("Invalid class ID format."),
  
  body("termId")
    .notEmpty().withMessage("Term ID is required.")
    .isUUID().withMessage("Invalid term ID format."),
];

// ─── Email Report Validator ───
const emailReportValidator = [
  body("termId")
    .notEmpty().withMessage("Term ID is required.")
    .isUUID().withMessage("Invalid term ID format."),
  
  body("classId")
    .optional()
    .isUUID().withMessage("Invalid class ID format."),
  
  body("studentId")
    .optional()
    .isUUID().withMessage("Invalid student ID format."),
  
  body().custom((value, { req }) => {
    if (!req.body.studentId && !req.body.classId) {
      throw new Error("Either studentId or classId is required.");
    }
    return true;
  }),
];

// ─── Get Report by ID Validator ───
const getReportValidator = [
  param("id")
    .notEmpty().withMessage("Report ID is required.")
    .isUUID().withMessage("Invalid report ID format."),
];

// ─── Approve Report Validator ───
const approveReportValidator = [
  param("id")
    .notEmpty().withMessage("Report ID is required.")
    .isUUID().withMessage("Invalid report ID format."),
];

// ─── Release Report Validator ───
const releaseReportValidator = [
  param("id")
    .notEmpty().withMessage("Report ID is required.")
    .isUUID().withMessage("Invalid report ID format."),
];

// ─── Regenerate PDF Validator ───
const regeneratePdfValidator = [
  param("id")
    .notEmpty().withMessage("Report ID is required.")
    .isUUID().withMessage("Invalid report ID format."),
];

// ─── Get Student Reports Validator ───
const getStudentReportsValidator = [
  param("studentId")
    .notEmpty().withMessage("Student ID is required.")
    .isUUID().withMessage("Invalid student ID format."),
];

// ─── Get Stats Validator ───
const getStatsValidator = [
  query("termId")
    .notEmpty().withMessage("Term ID is required.")
    .isUUID().withMessage("Invalid term ID format."),
];

// ─── Generate Batch Validator ───
const generateBatchValidator = [
  body("termId")
    .notEmpty().withMessage("Term ID is required.")
    .isUUID().withMessage("Invalid term ID format."),
  
  body("classIds")
    .isArray({ min: 1 }).withMessage("At least one class ID is required.")
    .custom((value) => {
      const allValid = value.every(id => 
        typeof id === 'string' && 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      );
      if (!allValid) {
        throw new Error("All class IDs must be valid UUIDs.");
      }
      return true;
    }),
];

// ─── List Reports Validator ───
const listReportsValidator = [
  query("termId")
    .optional()
    .isUUID().withMessage("Invalid term ID format."),
  
  query("classId")
    .optional()
    .isUUID().withMessage("Invalid class ID format."),
  
  query("studentId")
    .optional()
    .isUUID().withMessage("Invalid student ID format."),
  
  query("status")
    .optional()
    .isIn(['DRAFT', 'APPROVED', 'RELEASED']).withMessage("Status must be DRAFT, APPROVED, or RELEASED."),
];

// ─── Preview Report Validator ───
const previewReportValidator = [
  param("id")
    .notEmpty().withMessage("Report ID is required.")
    .isUUID().withMessage("Invalid report ID format."),
];

module.exports = {
  generateReportValidator,
  updateRemarksValidator,
  bulkReleaseValidator,
  emailReportValidator,
  getReportValidator,
  approveReportValidator,
  releaseReportValidator,
  regeneratePdfValidator,
  getStudentReportsValidator,
  getStatsValidator,
  generateBatchValidator,
  listReportsValidator,
  previewReportValidator,
};