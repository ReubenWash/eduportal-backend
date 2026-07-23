const { body, param, query } = require("express-validator");

const submitScoreValidator = [
  body("studentId").notEmpty().withMessage("Student ID is required."),
  body("subjectId").notEmpty().withMessage("Subject ID is required."),
  body("termId").notEmpty().withMessage("Term ID is required."),
  body("ca1").optional({ nullable: true }).isFloat({ min: 0, max: 10 }).withMessage("CA1 must be between 0 and 10."),
  body("ca2").optional({ nullable: true }).isFloat({ min: 0, max: 10 }).withMessage("CA2 must be between 0 and 10."),
  body("ca3").optional({ nullable: true }).isFloat({ min: 0, max: 10 }).withMessage("CA3 must be between 0 and 10."),
  body("examScore").optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage("Exam score must be between 0 and 100."),
];

const computeValidator = [
  body("classId").notEmpty().withMessage("Class ID is required."),
  body("termId").notEmpty().withMessage("Term ID is required."),
];

module.exports = { submitScoreValidator, computeValidator };
