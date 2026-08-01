const express = require("express");
const router = express.Router();
const controller = require("../controllers/staff.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { isSchoolAdmin, isSchoolStaff, isSuperAdmin } = require("../middleware/roles");
const { uploadStaffPhoto } = require("../middleware/upload");
const { uploadExcel } = require("../middleware/uploadExcel");
const { body } = require("express-validator");
const validate = require("../middleware/validate");

router.use(authenticate, tenantScope);

// ─── Export/Import ───
router.get("/export", isSchoolAdmin, controller.exportExcel);
router.post("/import-excel", isSchoolAdmin, uploadExcel, controller.importExcel);

// ─── Staff Management ───
router.get("/", isSchoolStaff, controller.list);
router.get("/:id", isSchoolStaff, controller.getOne);

// ✅ UNCOMMENTED - Create staff
router.post(
  "/",
  isSchoolAdmin,
  [
    body("firstName").trim().notEmpty().withMessage("First name is required."),
    body("lastName").trim().notEmpty().withMessage("Last name is required."),
    body("email").trim().isEmail().withMessage("Valid email required."),
    body("role").isIn(["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"]).withMessage("Invalid role."),
  ],
  validate,
  uploadStaffPhoto,
  controller.create
);

// ✅ UNCOMMENTED - Update staff
router.patch(
  "/:id",
  isSchoolAdmin,
  uploadStaffPhoto,
  controller.update
);

// ✅ UNCOMMENTED - Deactivate staff
router.delete(
  "/:id",
  isSchoolAdmin,
  controller.deactivate
);

// ─── Subject Assignment ───
// ✅ UNCOMMENTED - Assign subject to staff
router.post(
  "/:id/assign",
  isSchoolAdmin,
  [
    body("subjectId").notEmpty().withMessage("Subject ID is required."),
    body("classId").notEmpty().withMessage("Class ID is required.")
  ],
  validate,
  controller.assignSubject
);

// ✅ UNCOMMENTED - Remove subject assignment
router.delete(
  "/:id/assign",
  isSchoolAdmin,
  [
    body("subjectId").notEmpty().withMessage("Subject ID is required."),
    body("classId").notEmpty().withMessage("Class ID is required.")
  ],
  validate,
  controller.removeAssignment
);

// ─── Super Admin routes ───
router.get("/admin/all", isSuperAdmin, controller.getAllStaff);

module.exports = router;