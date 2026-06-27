const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/staff.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolAdmin, isSchoolStaff } = require("../middleware/roles");
const { uploadStaffPhoto } = require("../middleware/upload");
const { body, param } = require("express-validator");
const validate     = require("../middleware/validate");

router.use(authenticate, tenantScope);

router.get("/",     isSchoolStaff, controller.list);
router.get("/:id",  isSchoolStaff, controller.getOne);

router.post("/",
  isSchoolAdmin,
  [
    body("firstName").trim().notEmpty().withMessage("First name is required."),
    body("lastName").trim().notEmpty().withMessage("Last name is required."),
    body("email").trim().isEmail().withMessage("Valid email required."),
    body("role").isIn(["SCHOOL_ADMIN","CLASS_TEACHER","SUBJECT_TEACHER"]).withMessage("Invalid role."),
  ],
  validate,
  uploadStaffPhoto,
  controller.create
);

router.patch("/:id", isSchoolAdmin, uploadStaffPhoto, controller.update);
router.delete("/:id", isSchoolAdmin, controller.deactivate);

router.post("/:id/assign",
  isSchoolAdmin,
  [body("subjectId").notEmpty(), body("classId").notEmpty()],
  validate,
  controller.assignSubject
);

router.delete("/:id/assign",
  isSchoolAdmin,
  [body("subjectId").notEmpty(), body("classId").notEmpty()],
  validate,
  controller.removeAssignment
);

module.exports = router;
