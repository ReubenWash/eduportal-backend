const PORTAL_ROLES = {
  "school-administration": ["SUPER_ADMIN", "SCHOOL_ADMIN", "ACCOUNTANT"],
  "teaching-staff": ["CLASS_TEACHER", "SUBJECT_TEACHER"],
  "parents-guardians": ["PARENT"],
  students: ["STUDENT"],
};

const isSupportedPortal = (portal) => Object.hasOwn(PORTAL_ROLES, portal);

const isRoleAllowedForPortal = (portal, role) => {
  const allowedRoles = isSupportedPortal(portal) ? PORTAL_ROLES[portal] : null;
  return Boolean(allowedRoles && role && allowedRoles.includes(role));
};

module.exports = { isSupportedPortal, isRoleAllowedForPortal };
