const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/report.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { authorize, isSchoolAdmin } = require("../middleware/roles");
const validate     = require("../middleware/validate");
const {
  generateReportValidator,
  updateRemarksValidator,
  bulkReleaseValidator,
  emailReportValidator,
} = require("../validators/report.validator");

router.use(authenticate, tenantScope);

// Who may do what:
//  - canManageReports: admins + class teachers (class teachers only ever see their own class;
//    that is enforced in report.service, not just here)
//  - canViewReportFile: the above + students/parents, who can only open their own RELEASED report
const canManageReports  = authorize("SUPER_ADMIN", "SCHOOL_ADMIN", "CLASS_TEACHER");
const canViewReportFile = authorize("SUPER_ADMIN", "SCHOOL_ADMIN", "CLASS_TEACHER", "PARENT", "STUDENT");

// ─── Classes the user can write remarks for (before /:id) ───
router.get("/my-classes", canManageReports, controller.myClasses);

// ─── Stats ───
router.get("/stats", isSchoolAdmin, controller.getStats);

// ─── Whole class downloads — must be before /:id to avoid route conflict ───
// One combined PDF (one card per page) and a ZIP (one PDF per student).
// Admins: any class. Class teachers: their own class (checked in report.service).
router.get("/class/:classId/term/:termId/pdf", canManageReports, controller.downloadClassPDF);
router.get("/class/:classId/term/:termId", canManageReports, controller.downloadClassZIP);

// ─── Student Reports ───
router.get("/student/:studentId", canManageReports, controller.getStudentReports);

// ─── Bulk operations — also before /:id ───
router.post("/generate", isSchoolAdmin, generateReportValidator, validate, controller.generate);
router.post("/generate-batch", isSchoolAdmin, controller.generateBatch);
router.post("/release-bulk", isSchoolAdmin, bulkReleaseValidator, validate, controller.bulkRelease);
router.post("/email", isSchoolAdmin, emailReportValidator, validate, controller.emailReports);

// ─── List / filter ───
router.get("/", canManageReports, controller.list);

// ─── Single report operations ───
router.get("/:id", canManageReports, controller.getOne);
router.get("/:id/preview", canViewReportFile, controller.preview);
router.get("/:id/pdf", canViewReportFile, controller.downloadPDF);

router.patch("/:id/remarks",
  canManageReports,
  updateRemarksValidator,
  validate,
  controller.updateRemarks
);

router.post("/:id/approve", isSchoolAdmin, controller.approve);
router.post("/:id/release", isSchoolAdmin, controller.release);
router.post("/:id/regenerate-pdf", isSchoolAdmin, controller.regeneratePDF);

module.exports = router;