const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/enrollment.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.use(authenticate, tenantScope);

router.get("/", isSchoolStaff, controller.list);

router.post("/",
  isSchoolAdmin,
  [
    body("studentId").notEmpty().withMessage("Student ID required."),
    body("classId").notEmpty().withMessage("Class ID required."),
    body("termId").notEmpty().withMessage("Term ID required."),
  ],
  validate,
  controller.enroll
);

router.post("/bulk",
  isSchoolAdmin,
  [
    body("studentIds").isArray({ min: 1 }).withMessage("studentIds must be a non-empty array."),
    body("classId").notEmpty().withMessage("Class ID required."),
    body("termId").notEmpty().withMessage("Term ID required."),
  ],
  validate,
  controller.bulkEnroll
);

router.delete("/:id", isSchoolAdmin, controller.remove);

module.exports = router;
