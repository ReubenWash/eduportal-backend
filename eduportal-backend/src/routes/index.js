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
router.use("/documents",     require("./document.routes"));

// ── Super Admin Routes (All Phases) ──────────────────────────
// These were missing! Now all admin routes are mounted.
router.use("/admin/audit",        require("./admin/audit.routes"));
router.use("/admin/security",     require("./admin/security.routes"));
router.use("/admin/subscriptions", require("./admin/subscription.routes"));  // subscriptions, payments, revenue
router.use("/admin/support",      require("./admin/support.routes"));
router.use("/admin/cms",          require("./admin/cms.routes"));
router.use("/admin/integrations", require("./admin/integration.routes"));
router.use("/admin/system",       require("./admin/system.routes"));
router.use("/admin/config",       require("./config.routes"));
router.use("/admin/users",        require("./admin-users.routes"));
router.use("/admin/emails",       require("./admin/email.routes"));
router.use("/admin/notifications", require("./admin/notification.routes"));
router.use("/admin/broadcasts",   require("./admin/broadcast.routes"));
router.use("/admin/roles",        require("./admin/role.routes"));
router.use("/admin/analytics",    require("./admin/analytics.routes"));
router.use("/admin/media",        require("./admin/media.routes"));

module.exports = router;