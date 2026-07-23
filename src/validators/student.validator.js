const { body, param, query } = require("express-validator");

const admitStudentValidator = [
  body("firstName").trim().notEmpty().withMessage("First name is required."),
  body("lastName").trim().notEmpty().withMessage("Last name is required."),
  body("gender").isIn(["MALE", "FEMALE"]).withMessage("Gender must be MALE or FEMALE."),
  body("dateOfBirth")
    .notEmpty().withMessage("Date of birth is required.")
    .isISO8601().withMessage("Date of birth must be a valid date."),
  body("classId").notEmpty().withMessage("Class is required."),
  body("guardianId").notEmpty().withMessage("Guardian is required."),
];

const updateStudentValidator = [
  param("id").notEmpty().withMessage("Student ID is required."),
  body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty."),
  body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty."),
  body("gender").optional().isIn(["MALE", "FEMALE"]).withMessage("Invalid gender."),
  body("dateOfBirth").optional().isISO8601().withMessage("Invalid date."),
];

const transferValidator = [
  param("id").notEmpty().withMessage("Student ID is required."),
  body("destinationSchool").optional().trim(),
];

module.exports = { admitStudentValidator, updateStudentValidator, transferValidator };
