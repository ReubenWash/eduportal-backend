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

// Self-service student routes — MUST come before "/:id"
router.get("/me",                controller.getMe);
router.get("/me/report-cards",   controller.getMyReportCards);
router.get("/me/grades",         controller.getMyGrades);

// Excel — also before "/:id"
router.get("/export",        isSchoolStaff, controller.exportExcel);
// router.post("/import-excel", isSchoolAdmin, uploadExcel, controller.importExcel); // Commented out

router.get("/",                isSchoolStaff, controller.list);
router.get("/:id",             isSchoolStaff, controller.getOne);
router.get("/:id/reports",     isSchoolStaff, controller.getReports);
router.get("/:id/transcript",  isSchoolStaff, controller.getTranscript);

// ─── TEMPORARILY COMMENTED OUT - Fix controller.admit ───
// router.post("/",
//   isSchoolAdmin,
//   uploadStudentPhoto,
//   admitStudentValidator,
//   validate,
//   controller.admit
// );

// ─── TEMPORARILY COMMENTED OUT - Fix controller.bulkImport ───
// router.post("/bulk-import", isSchoolAdmin, controller.bulkImport);

// ─── TEMPORARILY COMMENTED OUT - Fix controller.update ───
// router.patch("/:id",
//   isSchoolAdmin,
//   uploadStudentPhoto,
//   updateStudentValidator,
//   validate,
//   controller.update
// );

// ─── TEMPORARILY COMMENTED OUT - Fix controller.withdraw ───
// router.delete("/:id", isSchoolAdmin, controller.withdraw);

// ─── TEMPORARILY COMMENTED OUT - Fix controller.transfer ───
// router.post("/:id/transfer",
//   isSchoolAdmin,
//   transferValidator,
//   validate,
//   controller.transfer
// );

// ─── TEMPORARILY COMMENTED OUT - Fix controller.getAllStudents ───
// router.get("/admin/all", isSuperAdmin, controller.getAllStudents);

module.exports = router;