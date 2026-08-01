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

// ─── All routes require authentication and tenant scope ───
router.use(authenticate, tenantScope);

// ─── Export/Import ───
router.get("/export", isSchoolAdmin, controller.exportExcel);
router.post("/import-excel", isSchoolAdmin, uploadExcel, controller.importExcel);

// ─── Staff Management ───
router.get("/", isSchoolStaff, controller.list);
router.get("/:id", isSchoolStaff, controller.getOne);

// ─── Create Staff ───
router.post(
  "/",
  isSchoolAdmin,
  [
    body("firstName").trim().notEmpty().withMessage("First name is required."),
    body("lastName").trim().notEmpty().withMessage("Last name is required."),
    body("email").trim().isEmail().withMessage("Valid email required."),
    body("role").isIn(["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"]).withMessage("Invalid role."),
    body("phone").optional().trim().isLength({ min: 5, max: 20 }).withMessage("Phone must be 5-20 characters."),
  ],
  validate,
  uploadStaffPhoto,
  controller.create
);

// ─── Update Staff ───
router.patch(
  "/:id",
  isSchoolAdmin,
  [
    body("firstName").optional().trim().notEmpty().withMessage("First name cannot be empty."),
    body("lastName").optional().trim().notEmpty().withMessage("Last name cannot be empty."),
    body("email").optional().trim().isEmail().withMessage("Valid email required."),
    body("role").optional().isIn(["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"]).withMessage("Invalid role."),
    body("phone").optional().trim().isLength({ min: 5, max: 20 }).withMessage("Phone must be 5-20 characters."),
  ],
  validate,
  uploadStaffPhoto,
  controller.update
);

// ─── Deactivate Staff ───
router.delete(
  "/:id",
  isSchoolAdmin,
  controller.deactivate
);

// ─── Subject Assignment ───
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

// ─── Remove Subject Assignment ───
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

// ─── Optional: Get staff by school (Super Admin) ───
router.get("/admin/school/:schoolId", isSuperAdmin, controller.getStaffBySchool);

module.exports = router;