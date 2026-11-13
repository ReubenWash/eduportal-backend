const express = require("express");
const { body } = require("express-validator");
const controller = require("../controllers/studyAssistant.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { authorize } = require("../middleware/roles");
const validate = require("../middleware/validate");
const { studyAssistantLimiter } = require("../middleware/rateLimiter");

const router = express.Router();

router.use(
  authenticate,
  tenantScope,
  authorize("STUDENT", "CLASS_TEACHER", "SUBJECT_TEACHER"),
  studyAssistantLimiter
);

router.post(
  "/ask",
  [body("question").isString().trim().notEmpty().isLength({ max: 2000 }).withMessage("Question must be between 1 and 2000 characters.")],
  validate,
  controller.ask
);

router.post(
  "/quiz",
  [
    body("classId").optional().isUUID(),
    body("subject").optional().isString().trim().isLength({ min: 1, max: 100 }),
    body("count").optional().isInt({ min: 1, max: 10 }).toInt(),
  ],
  validate,
  controller.quiz
);

module.exports = router;
