const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/attendance.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolStaff } = require("../middleware/roles");
const validate     = require("../middleware/validate");
const { markAttendanceValidator, bulkAttendanceValidator } = require("../validators/attendance.validator");

router.use(authenticate, tenantScope);

router.get("/",          isSchoolStaff, controller.list);
router.get("/summary",   isSchoolStaff, controller.summary);
router.get("/analytics", isSchoolStaff, controller.analytics);

router.post("/",      isSchoolStaff, markAttendanceValidator, validate, controller.mark);
router.post("/bulk",  isSchoolStaff, bulkAttendanceValidator, validate, controller.bulkMark);
router.patch("/:id",  isSchoolStaff, controller.update);

module.exports = router;
