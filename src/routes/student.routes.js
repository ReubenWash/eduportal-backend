// src/routes/student.routes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/student.controller");
const authenticate = require("../middleware/auth");
const tenantScope = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin, isSuperAdmin } = require("../middleware/roles");
const { uploadStudentPhoto } = require("../middleware/upload");
const { uploadExcel } = require("../middleware/uploadExcel");
const validate = require("../middleware/validate");
const { body } = require("express-validator");
const { admitStudentValidator, updateStudentValidator, transferValidator } = require("../validators/student.validator");

router.use(authenticate, tenantScope);

// ─── Self-service student routes ───
router.get("/me", controller.getMe);
router.get("/me/report-cards", controller.getMyReportCards);
router.get("/me/grades", controller.getMyGrades);

// ─── Excel Export/Import ───
router.get("/export", isSchoolStaff, controller.exportExcel);
router.post("/import-excel", isSchoolAdmin, uploadExcel, controller.importExcel);

// ─── Student Management ───
router.get("/", isSchoolStaff, controller.list);
router.get("/:id", isSchoolStaff, controller.getOne);
router.get("/:id/reports", isSchoolStaff, controller.getReports);
router.get("/:id/transcript", isSchoolStaff, controller.getTranscript);

// ─── Admit Student ───
router.post(
  "/",
  isSchoolAdmin,
  uploadStudentPhoto,
  admitStudentValidator,
  validate,
  controller.admit
);

router.post("/bulk-import", isSchoolAdmin, controller.bulkImport);

// ─── Update Student ───
router.patch(
  "/:id",
  isSchoolAdmin,
  uploadStudentPhoto,
  updateStudentValidator,
  validate,
  controller.update
);

// ─── Withdraw Student ───
router.delete("/:id", isSchoolAdmin, controller.withdraw);

// ─── Transfer Student ───
router.post(
  "/:id/transfer",
  isSchoolAdmin,
  transferValidator,
  validate,
  controller.transfer
);

// ════════════════════════════════════════════════════════
// ─── NEW: GUARDIAN PORTAL ENDPOINTS ───────────────────
// ════════════════════════════════════════════════════════

// ─── Link Existing Guardian to Student ───
router.post(
  "/:studentId/link-guardian",
  isSchoolAdmin,
  [
    body("guardianEmail")
      .trim()
      .notEmpty()
      .withMessage("Guardian email is required.")
      .isEmail()
      .withMessage("Please provide a valid email address."),
  ],
  validate,
  controller.linkGuardian
);

// ─── Resend Guardian Portal Credentials ───
router.post(
  "/guardians/:guardianId/resend-credentials",
  isSchoolAdmin,
  controller.resendGuardianCredentials
);

// ─── Get Guardian's Children (for Parent Portal) ───
router.get(
  "/guardians/me/children",
  controller.getGuardianChildren
);

// ─── Get Guardian's Child Details ───
router.get(
  "/guardians/me/children/:studentId/report-cards",
  controller.getChildReportCards
);

router.get(
  "/guardians/me/children/:studentId/grades",
  controller.getChildGrades
);

router.get(
  "/guardians/me/children/:studentId/attendance",
  controller.getChildAttendance
);

// ════════════════════════════════════════════════════════
// ─── SUPER ADMIN ENDPOINTS ─────────────────────────────
// ════════════════════════════════════════════════════════

// ─── Get all students across all schools ───
router.get(
  "/admin/all",
  isSuperAdmin,
  controller.getAllStudents
);

// ─── Get student by ID (Super Admin) ───
router.get(
  "/admin/:id",
  isSuperAdmin,
  controller.getStudentById
);

module.exports = router;