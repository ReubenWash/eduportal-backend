const express = require("express");
const router  = express.Router();
const { apiLimiter } = require("../middleware/rateLimiter");

// Apply general rate limit to all API routes
router.use(apiLimiter);

// ── Mount all route modules ────────────────────────────────────
router.use("/auth",          require("./auth.routes"));
router.use("/schools",       require("./school.routes"));
router.use("/staff",         require("./staff.routes"));
router.use("/students",      require("./student.routes"));
router.use("/guardians",     require("./guardian.routes"));
router.use("/classes",       require("./class.routes"));
router.use("/subjects",      require("./subject.routes"));
router.use("/enrollments",   require("./enrollment.routes"));
router.use("/scores",        require("./score.routes"));
router.use("/attendance",    require("./attendance.routes"));
router.use("/reports",       require("./report.routes"));
router.use("/analytics",     require("./analytics.routes"));
router.use("/notifications", require("./notification.routes"));

module.exports = router;
