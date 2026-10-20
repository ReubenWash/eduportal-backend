// backend/src/middleware/roles.js
const { sendError } = require("../utils/apiResponse");

/**
 * Role-based access control middleware
 * Usage: authorize("SCHOOL_ADMIN", "SUPER_ADMIN")
 * @param  {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, "Authentication required.");
    }

    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        403,
        `Access denied. Required role(s): ${roles.join(", ")}.`
      );
    }

    next();
  };
};

// ── Convenience role constants ─────────────────────────────────
const ROLES = {
  SUPER_ADMIN:     "SUPER_ADMIN",
  SCHOOL_ADMIN:    "SCHOOL_ADMIN",
  CLASS_TEACHER:   "CLASS_TEACHER",
  SUBJECT_TEACHER: "SUBJECT_TEACHER",
  PARENT:          "PARENT",
  STUDENT:         "STUDENT",
  ACCOUNTANT:      "ACCOUNTANT",
};

// ── Common role groups ─────────────────────────────────────────
const isAdmin = authorize("SUPER_ADMIN", "SCHOOL_ADMIN");
const isTeacher = authorize("CLASS_TEACHER", "SUBJECT_TEACHER");
const isSchoolStaff = authorize("SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER");
const isSuperAdmin = authorize("SUPER_ADMIN");
// Finance routes: school admin (full control) or an accountant (recording
// only — manage_finance_categories isn't in their permission set, so the
// requirePermission check on top of this still blocks them from defining
// categories even though this role check lets them into the route group).
const isFinanceStaff = authorize("SCHOOL_ADMIN", "SUPER_ADMIN", "ACCOUNTANT");

// ✅ FIX: Allow both SCHOOL_ADMIN and SUPER_ADMIN
const isSchoolAdmin = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 401, "Authentication required.");
  }
  
  // Allow both SCHOOL_ADMIN and SUPER_ADMIN
  if (req.user.role === "SCHOOL_ADMIN" || req.user.role === "SUPER_ADMIN") {
    return next();
  }
  
  return sendError(
    res,
    403,
    "Access denied. Required role: SCHOOL_ADMIN or SUPER_ADMIN."
  );
};

module.exports = { 
  authorize, 
  ROLES, 
  isAdmin, 
  isTeacher, 
  isSchoolStaff, 
  isSuperAdmin, 
  isSchoolAdmin,
  isFinanceStaff
};