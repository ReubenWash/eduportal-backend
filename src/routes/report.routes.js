const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/report.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin } = require("../middleware/roles");
const validate     = require("../middleware/validate");
const {
  generateReportValidator,
  updateRemarksValidator,
  bulkReleaseValidator,
  emailReportValidator,
} = require("../validators/report.validator");

router.use(authenticate, tenantScope);

// Class ZIP — must be before /:id to avoid route conflict
router.get("/class/:classId/term/:termId", isSchoolAdmin, controller.downloadClassZIP);

// Bulk operations — also before /:id
router.post("/generate",     isSchoolAdmin, generateReportValidator, validate, controller.generate);
router.post("/release-bulk", isSchoolAdmin, bulkReleaseValidator,    validate, controller.bulkRelease);
router.post("/email",        isSchoolAdmin, emailReportValidator,    validate, controller.emailReports);

// Single report operations
router.get("/:id",            isSchoolStaff, controller.getOne);
router.get("/:id/preview",    isSchoolStaff, controller.preview);

router.patch("/:id/remarks",
  isSchoolStaff,
  updateRemarksValidator,
  validate,
  controller.updateRemarks
);

router.post("/:id/approve",        isSchoolAdmin, controller.approve);
router.post("/:id/release",        isSchoolAdmin, controller.release);
router.post("/:id/regenerate-pdf", isSchoolAdmin, controller.regeneratePDF);

module.exports = router;
