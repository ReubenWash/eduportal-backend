const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/school.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolAdmin, isSuperAdmin, isSchoolStaff } = require("../middleware/roles");
const validate     = require("../middleware/validate");
const { publicLimiter } = require("../middleware/rateLimiter");
const { uploadSchoolLogo } = require("../middleware/upload");
const {
  registerSchoolValidator,
  updateSchoolValidator,
  createTermValidator,
  updateTermValidator,
  updateSchoolStatusValidator,
} = require("../validators/school.validator");

// ── Public ─────────────────────────────────────────────────────
router.post(
  "/register",
  publicLimiter,
  registerSchoolValidator,
  validate,
  controller.register
);

// ── Protected — school-scoped ──────────────────────────────────
router.use(authenticate, tenantScope);

// ─── School Profile Routes ───
router.get("/me", isSchoolStaff, controller.getProfile);
router.get("/me/dashboard", isSchoolStaff, controller.getDashboard);
router.get("/me/terms", isSchoolStaff, controller.getTerms);

// ✅ School Admin can update profile
router.patch(
  "/me",
  isSchoolAdmin,
  uploadSchoolLogo,
  updateSchoolValidator,
  validate,
  controller.updateProfile
);

// ─── Term Management ───
// ✅ Create term
router.post(
  "/me/terms",
  isSchoolAdmin,
  createTermValidator,
  validate,
  controller.createTerm
);

// ✅ Update term
router.patch(
  "/me/terms/:id",
  isSchoolAdmin,
  updateTermValidator,
  validate,
  controller.updateTerm
);

// ✅ NEW: Update term status
router.patch(
  "/me/terms/:id/status",
  isSchoolAdmin,
  [
    body("status")
      .notEmpty()
      .withMessage("Status is required")
      .isIn(["UPCOMING", "ACTIVE", "COMPLETED"])
      .withMessage("Status must be UPCOMING, ACTIVE, or COMPLETED"),
  ],
  validate,
  controller.updateTermStatus
);

// ── Super Admin only ───────────────────────────────────────────
router.get("/", isSuperAdmin, controller.getAllSchools);
router.get("/admin/dashboard", isSuperAdmin, controller.getSuperAdminDashboard);

router.post(
  "/manual",
  isSuperAdmin,
  registerSchoolValidator,
  validate,
  controller.manualCreate
);

router.patch(
  "/:id/status",
  isSuperAdmin,
  updateSchoolStatusValidator,
  validate,
  controller.updateStatus
);

// ─── Super Admin School Management ───
router.patch(
  "/:id",
  isSuperAdmin,
  controller.updateSchool
);

router.patch(
  "/:id/plan",
  isSuperAdmin,
  controller.updateSchoolPlan
);

router.delete(
  "/:id",
  isSuperAdmin,
  controller.deleteSchool
);

router.patch(
  "/:id/restore",
  isSuperAdmin,
  controller.restoreSchool
);

router.get(
  "/:id/registration-pdf",
  isSuperAdmin,
  controller.downloadRegistrationPdf
);

// ─── Debug Endpoints (Super Admin only - Remove in production) ───
router.get(
  "/debug/check/:id",
  isSuperAdmin,
  controller.debugCheckSchool
);

router.get(
  "/debug/status/:id",
  isSuperAdmin,
  controller.debugGetStatus
);

router.get(
  "/debug/all",
  isSuperAdmin,
  controller.debugGetAllSchools
);

module.exports = router;