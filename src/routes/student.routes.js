const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/student.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff, isSchoolAdmin, isSuperAdmin } = require("../middleware/roles");
const { uploadStudentPhoto } = require("../middleware/upload");
const { uploadExcel } = require("../middleware/uploadExcel");
const validate     = require("../middleware/validate");
const { admitStudentValidator, updateStudentValidator, transferValidator } = require("../validators/student.validator");

router.use(authenticate, tenantScope);

// ─── Self-service student routes ───
router.get("/me",                controller.getMe);
router.get("/me/report-cards",   controller.getMyReportCards);
router.get("/me/grades",         controller.getMyGrades);

// ─── Excel Export/Import ───
router.get("/export",        isSchoolStaff, controller.exportExcel);
router.post("/import-excel", isSchoolAdmin, uploadExcel, controller.importExcel);

// ─── Student Management ───
router.get("/",                isSchoolStaff, controller.list);
router.get("/:id",             isSchoolStaff, controller.getOne);
router.get("/:id/reports",     isSchoolStaff, controller.getReports);
router.get("/:id/transcript",  isSchoolStaff, controller.getTranscript);

// ─── Admit Student ───
router.post("/",
  isSchoolAdmin,
  uploadStudentPhoto,
  admitStudentValidator,
  validate,
  controller.admit
);

router.post("/bulk-import", isSchoolAdmin, controller.bulkImport);

// ─── Update Student ───
router.patch("/:id",
  isSchoolAdmin,
  uploadStudentPhoto,
  updateStudentValidator,
  validate,
  controller.update
);

// ─── Withdraw Student ───
router.delete("/:id", isSchoolAdmin, controller.withdraw);

// ─── Transfer Student ───
router.post("/:id/transfer",
  isSchoolAdmin,
  transferValidator,
  validate,
  controller.transfer
);

// ─── Super Admin routes ───
router.get("/admin/all", isSuperAdmin, controller.getAllStudents);

module.exports = router;