const express      = require("express");
const router       = express.Router();
const controller   = require("../controllers/analytics.controller");
const authenticate = require("../middleware/auth");
const tenantScope  = require("../middleware/tenant");
const { isSchoolAdmin, isSuperAdmin } = require("../middleware/roles");

// ─── Apply authentication and tenant scope to all routes ──────
router.use(authenticate, tenantScope);

// ─── Helper middleware to allow School Admin OR Super Admin ──
const allowSchoolAdminOrSuperAdmin = (req, res, next) => {
  if (req.user.role === 'SCHOOL_ADMIN' || req.user.role === 'SUPER_ADMIN') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Access denied. Only School Admins and Super Admins can access this resource.'
  });
};

// ─── Routes accessible by School Admin OR Super Admin ──────────
router.get("/performance",  allowSchoolAdminOrSuperAdmin, controller.performance);
router.get("/subjects",     allowSchoolAdminOrSuperAdmin, controller.subjects);
router.get("/top-students", allowSchoolAdminOrSuperAdmin, controller.topStudents);
router.get("/trends",       allowSchoolAdminOrSuperAdmin, controller.trends);
router.get("/gender",       allowSchoolAdminOrSuperAdmin, controller.gender);
router.get("/export",       allowSchoolAdminOrSuperAdmin, controller.exportData);

module.exports = router;