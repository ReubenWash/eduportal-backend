const express      = require("express");
const router       = express.Router();
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

// ── CMS Routes (Public & Admin) ──────────────────────────────
router.use("/cms",           require("./cms.routes"));        // Public CMS routes
router.use("/admin/cms",     require("./admin/cms.routes"));  // Admin CMS routes

// ── Legal Routes (Public & Admin) ────────────────────────────
router.use("/legal",         require("./legal.routes"));       // Public legal routes
router.use("/admin/legal",   require("./admin/legal.routes")); // Admin legal routes

// ── Super Admin Routes ────────────────────────────────────────
// School Management
router.use("/admin/schools", require("./admin/school.routes"));

// Security
router.use("/admin/security", require("./admin/security.routes"));

// Audit
router.use("/admin/audit",   require("./admin/audit.routes"));

// Subscriptions & Billing
router.use("/admin/subscriptions", require("./admin/subscription.routes"));

// Support
router.use("/admin/support", require("./admin/support.routes"));

// Integrations
router.use("/admin/integrations", require("./admin/integration.routes"));

// System
router.use("/admin/system",  require("./admin/system.routes"));

// Config
router.use("/admin/config",  require("./config.routes"));

// Users
router.use("/admin/users",   require("./admin-users.routes"));

// Emails
router.use("/admin/emails",  require("./admin/email.routes"));

// Notifications
router.use("/admin/notifications", require("./admin/notification.routes"));

// Broadcasts
router.use("/admin/broadcasts", require("./admin/broadcast.routes"));

// Roles
router.use("/admin/roles",   require("./admin/role.routes"));

// Analytics
router.use("/admin/analytics", require("./admin/analytics.routes"));

// Media Upload
router.use("/upload", require("./upload.routes"));
// In routes/index.js, make sure this line exists


// Media
router.use("/admin/media",   require("./admin/media.routes"));

// ── Test Routes ──────────────────────────────────────────────────
router.use("/test",          require("./test.routes"));

module.exports = router;