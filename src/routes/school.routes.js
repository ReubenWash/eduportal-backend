const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/school.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolAdmin, isSuperAdmin } = require("../middleware/roles");
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

router.get("/me",           controller.getProfile);
router.get("/me/dashboard", controller.getDashboard);
router.get("/me/terms",     controller.getTerms);

router.patch(
  "/me",
  isSchoolAdmin,
  uploadSchoolLogo,
  updateSchoolValidator,
  validate,
  controller.updateProfile
);

router.post(
  "/me/terms",
  isSchoolAdmin,
  createTermValidator,
  validate,
  controller.createTerm
);

router.patch(
  "/me/terms/:id",
  isSchoolAdmin,
  updateTermValidator,
  validate,
  controller.updateTerm
);

// ── Super Admin only ───────────────────────────────────────────
router.get("/",         isSuperAdmin, controller.getAllSchools);

router.patch(
  "/:id/status",
  isSuperAdmin,
  updateSchoolStatusValidator,
  validate,
  controller.updateStatus
);

module.exports = router;
