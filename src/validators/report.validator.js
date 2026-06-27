const { body, param } = require("express-validator");

const generateReportValidator = [
  body("termId").notEmpty().withMessage("Term ID is required."),
  body("studentId").optional(),
  body("classId").optional(),
];

const updateRemarksValidator = [
  param("id").notEmpty().withMessage("Report ID is required."),
  body("teacherRemark").optional().trim().isLength({ max: 500 }).withMessage("Teacher remark cannot exceed 500 characters."),
  body("headRemark").optional().trim().isLength({ max: 500 }).withMessage("Head remark cannot exceed 500 characters."),
];

const bulkReleaseValidator = [
  body("classId").notEmpty().withMessage("Class ID is required."),
  body("termId").notEmpty().withMessage("Term ID is required."),
];

const emailReportValidator = [
  body("termId").notEmpty().withMessage("Term ID is required."),
  body("classId").optional(),
  body("studentId").optional(),
];

module.exports = {
  generateReportValidator,
  updateRemarksValidator,
  bulkReleaseValidator,
  emailReportValidator,
};
