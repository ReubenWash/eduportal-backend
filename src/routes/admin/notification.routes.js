const express = require('express');
const router = express.Router();
const controller = require('../../controllers/notification.controller');
const authenticate = require('../../middleware/auth');
const { isSuperAdmin } = require('../../middleware/roles');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');

router.use(authenticate, isSuperAdmin);

router.post('/push', [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters.'),
  body('body').trim().isLength({ min: 1, max: 2000 }).withMessage('Body must be 1-2000 characters.'),
  body('audience')
    .optional()
    .isIn(['ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'SCHOOLS', 'ALL_SCHOOLS', 'PREMIUM_ONLY', 'BASIC_ONLY', 'SELECTED_SCHOOLS'])
    .withMessage('Invalid push audience.'),
  body('selectedSchools').optional().isArray().withMessage('selectedSchools must be an array of school ids.'),
  body('selectedSchools.*').optional().isString().notEmpty().withMessage('Each selected school id must be a non-empty string.'),
], validate, controller.push);

module.exports = router;
