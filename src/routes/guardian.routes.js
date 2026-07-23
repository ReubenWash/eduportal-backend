const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/guardian.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.use(authenticate, tenantScope);

// Self-service guardian routes
router.get("/me/children", controller.getMyChildren);
router.get("/me/children/:studentId/report-cards", controller.getChildReportCards);
router.get("/me/children/:studentId/grades", controller.getChildGrades);
router.get("/me/children/:studentId/attendance-summary", controller.getChildAttendance);

router.get("/",    isSchoolStaff, controller.list);
router.get("/:id", isSchoolStaff, controller.getOne);

router.post("/",
  isSchoolAdmin,
  [
    body("firstName").trim().notEmpty().withMessage("First name is required."),
    body("lastName").trim().notEmpty().withMessage("Last name is required."),
    body("phone").trim().notEmpty().withMessage("Phone is required."),
    body("relationship").trim().notEmpty().withMessage("Relationship is required."),
  ],
  validate,
  controller.create
);

router.patch("/:id", isSchoolAdmin, controller.update);

router.post("/:id/link",
  isSchoolAdmin,
  [body("studentId").notEmpty().withMessage("Student ID is required.")],
  validate,
  controller.linkStudent
);

module.exports = router;
