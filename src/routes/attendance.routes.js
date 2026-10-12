const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/attendance.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff } = require("../middleware/roles");
const { requirePermission } = require("../middleware/permission");
const validate     = require("../middleware/validate");
const { markAttendanceValidator, bulkAttendanceValidator } = require("../validators/attendance.validator");

router.use(authenticate, tenantScope);

router.get("/",          isSchoolStaff, controller.list);
router.get("/summary",   isSchoolStaff, controller.summary);
router.get("/analytics", isSchoolStaff, controller.analytics);

// isSchoolStaff still gates "is this a staff member of this school" —
// requirePermission adds the actual granular check: a role's CustomRole
// permissions (edited live in the super admin's Roles screen) now control
// whether that role can actually mark/edit attendance, not just whether
// it's broadly a staff role.
router.post("/",      isSchoolStaff, requirePermission("manage_attendance"), markAttendanceValidator, validate, controller.mark);
router.post("/bulk",  isSchoolStaff, requirePermission("manage_attendance"), bulkAttendanceValidator, validate, controller.bulkMark);
router.patch("/:id",  isSchoolStaff, requirePermission("manage_attendance"), controller.update);

module.exports = router;
