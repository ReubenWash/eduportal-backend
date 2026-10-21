const { sendError } = require("../utils/apiResponse");
const roleService = require("../services/role.service");

/**
 * Gate a route behind a specific permission from the custom-roles
 * catalogue (see role.service.js), on top of whatever coarse role check
 * (isSchoolStaff, isSchoolAdmin, etc.) already runs before it.
 *
 * This checks the CustomRole currently seeded with the name matching the
 * requesting user's Role enum — so editing permissions in the super
 * admin's Roles screen takes effect immediately, with no redeploy and no
 * per-user assignment step.
 *
 * Usage: router.post("/attendance/bulk", authenticate, tenantScope,
 *   isSchoolStaff, requirePermission("manage_attendance"), controller.bulkMark);
 *
 * @param {string} permission - one of ALL_PERMISSIONS in role.service.js
 */
const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) return sendError(res, 401, "Authentication required.");

    try {
      const allowed = await roleService.hasPermission(req.user.role, permission);
      if (!allowed) {
        return sendError(res, 403, `You don't have permission to do this (${permission}).`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { requirePermission };
