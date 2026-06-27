const { body, param } = require("express-validator");

const markAttendanceValidator = [
  body("studentId").notEmpty().withMessage("Student ID is required."),
  body("classId").notEmpty().withMessage("Class ID is required."),
  body("termId").notEmpty().withMessage("Term ID is required."),
  body("date").notEmpty().isISO8601().withMessage("A valid date is required."),
  body("status")
    .notEmpty()
    .isIn(["PRESENT", "ABSENT", "LATE", "EXCUSED"])
    .withMessage("Status must be PRESENT, ABSENT, LATE, or EXCUSED."),
];

const bulkAttendanceValidator = [
  body("classId").notEmpty().withMessage("Class ID is required."),
  body("termId").notEmpty().withMessage("Term ID is required."),
  body("date").notEmpty().isISO8601().withMessage("A valid date is required."),
  body("records").isArray({ min: 1 }).withMessage("Records must be a non-empty array."),
  body("records.*.studentId").notEmpty().withMessage("Each record must have a studentId."),
  body("records.*.status")
    .notEmpty()
    .isIn(["PRESENT", "ABSENT", "LATE", "EXCUSED"])
    .withMessage("Each record must have a valid status."),
];

module.exports = { markAttendanceValidator, bulkAttendanceValidator };
