const { prisma }    = require("../config/db");
const { sendError } = require("../utils/apiResponse");

/**
 * Tenant middleware — runs after authenticate
 * Validates that the school in the JWT is active
 * Attaches school record to req.school
 *
 * Skip for SUPER_ADMIN (they operate across all schools)
 */
const tenantScope = async (req, res, next) => {
  if (req.user.role === "SUPER_ADMIN") return next();

  const { schoolId } = req.user;

  if (!schoolId) {
    return sendError(res, 403, "No school associated with this account.");
  }

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, status: true, plan: true },
  });

  if (!school) {
    return sendError(res, 404, "School not found.");
  }

  if (school.status === "SUSPENDED") {
    return sendError(res, 403, "Your school account has been suspended. Please contact support.");
  }

  if (school.status === "DEACTIVATED") {
    return sendError(res, 403, "Your school account has been deactivated.");
  }

  if (school.status === "PENDING") {
    return sendError(res, 403, "Your school account is pending approval.");
  }

  req.school = school; // attach for use in controllers
  next();
};

module.exports = tenantScope;
