const { body } = require('express-validator');

const classLevelField = (optional = false) => {
  const field = body('level');
  if (optional) field.optional();
  return field
    .trim()
    .notEmpty().withMessage('Class level is required.')
    .isLength({ max: 40 }).withMessage('Class level cannot exceed 40 characters.');
};

const classSectionField = (optional = false) => {
  const field = body('section');
  if (optional) field.optional();
  return field
    .trim()
    .notEmpty().withMessage('Section or class name is required.')
    .isLength({ max: 40 }).withMessage('Section or class name cannot exceed 40 characters.');
};

const createClassValidator = [
  classLevelField(),
  classSectionField(),
  body('academicYear')
    .trim()
    .notEmpty().withMessage('Academic year is required.')
    .bail()
    .matches(/^\d{4}\/\d{4}$/)
    .withMessage('Academic year must be YYYY/YYYY.'),
];

const updateClassValidator = [
  classLevelField(true),
  classSectionField(true),
  body('academicYear')
    .optional()
    .matches(/^\d{4}\/\d{4}$/)
    .withMessage('Academic year must be YYYY/YYYY.'),
];

module.exports = { createClassValidator, updateClassValidator };