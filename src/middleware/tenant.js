const { prisma }    = require("../config/db");
const { sendError } = require("../utils/apiResponse");
const { buildActivityAuditData } = require("../utils/activityAudit");

const attachActivityAudit = (req, res) => {
  if (!["SCHOOL_ADMIN", "CLASS_TEACHER", "SUBJECT_TEACHER"].includes(req.user?.role)) return;

  res.once("finish", () => {
    const data = buildActivityAuditData(req, res.statusCode);
    if (!data) return;
    prisma.auditLog.create({
      data,
    }).catch(error => console.error("Activity audit write failed:", error.message));
  });
};

const activityAudit = (req, res, next) => {
  attachActivityAudit(req, res);
  next();
};

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
  attachActivityAudit(req, res);
  next();
};

module.exports = tenantScope;
module.exports.activityAudit = activityAudit;
