const { prisma } = require("../../config/db");
const { createError } = require("../../middleware/errorHandler");

// ─────────────────────────────────────────────────────
// Static permission catalogue, grouped by module.
// Mirrors the modules used across the rest of the platform.
// ─────────────────────────────────────────────────────
const PERMISSION_GROUPS = {
  "Platform Administration": [
    "PLATFORM_MANAGE_SCHOOLS", "PLATFORM_MANAGE_BILLING", "PLATFORM_MANAGE_USERS",
    "PLATFORM_MANAGE_CMS", "PLATFORM_MANAGE_SECURITY", "PLATFORM_MANAGE_SUPPORT",
    "PLATFORM_VIEW_AUDIT", "PLATFORM_MANAGE_BACKUPS",
  ],
  "Staff": ["STAFF_VIEW", "STAFF_CREATE", "STAFF_EDIT", "STAFF_DELETE"],
  "Students": ["STUDENTS_VIEW", "STUDENTS_CREATE", "STUDENTS_EDIT", "STUDENTS_DELETE"],
  "Guardians": ["GUARDIANS_VIEW", "GUARDIANS_CREATE", "GUARDIANS_EDIT", "GUARDIANS_DELETE"],
  "Classes & Subjects": ["CLASSES_VIEW", "CLASSES_MANAGE", "SUBJECTS_VIEW", "SUBJECTS_MANAGE"],
  "Enrollments": ["ENROLLMENTS_VIEW", "ENROLLMENTS_MANAGE"],
  "Scores": ["SCORES_VIEW", "SCORES_ENTER", "SCORES_APPROVE"],
  "Attendance": ["ATTENDANCE_VIEW", "ATTENDANCE_MARK"],
  "Reports": ["REPORTS_VIEW", "REPORTS_GENERATE", "REPORTS_APPROVE", "REPORTS_RELEASE"],
  "Analytics": ["ANALYTICS_VIEW", "ANALYTICS_EXPORT"],
  "Notifications": ["NOTIFICATIONS_VIEW", "NOTIFICATIONS_BROADCAST"],
  "Documents": ["DOCUMENTS_VIEW", "DOCUMENTS_UPLOAD", "DOCUMENTS_DELETE"],
};

// System roles seeded on first read, matching the six built-in auth roles.
// Kept in sync with the permissions matrix in the project docs.
const SYSTEM_ROLES = [
  {
    name: "Super Admin", isSystem: true, color: "violet",
    description: "Full platform control across every school.",
    permissions: [
      ...PERMISSION_GROUPS["Platform Administration"],
      "STAFF_VIEW", "STAFF_CREATE", "STAFF_EDIT", "STAFF_DELETE",
      "STUDENTS_VIEW", "STUDENTS_CREATE", "STUDENTS_EDIT", "STUDENTS_DELETE",
      "GUARDIANS_VIEW", "GUARDIANS_CREATE", "GUARDIANS_EDIT", "GUARDIANS_DELETE",
      "CLASSES_VIEW", "CLASSES_MANAGE", "SUBJECTS_VIEW", "SUBJECTS_MANAGE",
      "ENROLLMENTS_VIEW", "ENROLLMENTS_MANAGE",
      "SCORES_VIEW", "SCORES_ENTER", "SCORES_APPROVE",
      "ATTENDANCE_VIEW", "ATTENDANCE_MARK",
      "REPORTS_VIEW", "REPORTS_GENERATE", "REPORTS_APPROVE", "REPORTS_RELEASE",
      "ANALYTICS_VIEW", "ANALYTICS_EXPORT",
      "NOTIFICATIONS_VIEW", "NOTIFICATIONS_BROADCAST",
      "DOCUMENTS_VIEW", "DOCUMENTS_UPLOAD", "DOCUMENTS_DELETE",
    ],
  },
  {
    name: "School Admin", isSystem: true, color: "indigo",
    description: "Manages one school's day-to-day operations.",
    permissions: [
      "STAFF_VIEW", "STAFF_CREATE", "STAFF_EDIT", "STAFF_DELETE",
      "STUDENTS_VIEW", "STUDENTS_CREATE", "STUDENTS_EDIT", "STUDENTS_DELETE",
      "GUARDIANS_VIEW", "GUARDIANS_CREATE", "GUARDIANS_EDIT", "GUARDIANS_DELETE",
      "CLASSES_VIEW", "CLASSES_MANAGE", "SUBJECTS_VIEW", "SUBJECTS_MANAGE",
      "ENROLLMENTS_VIEW", "ENROLLMENTS_MANAGE",
      "SCORES_VIEW", "SCORES_ENTER", "SCORES_APPROVE",
      "ATTENDANCE_VIEW", "ATTENDANCE_MARK",
      "REPORTS_VIEW", "REPORTS_GENERATE", "REPORTS_APPROVE", "REPORTS_RELEASE",
      "ANALYTICS_VIEW", "ANALYTICS_EXPORT",
      "NOTIFICATIONS_VIEW", "NOTIFICATIONS_BROADCAST",
      "DOCUMENTS_VIEW", "DOCUMENTS_UPLOAD", "DOCUMENTS_DELETE",
    ],
  },
  {
    name: "Class Teacher", isSystem: true, color: "blue",
    description: "Manages one specific class.",
    permissions: [
      "STUDENTS_VIEW", "STUDENTS_EDIT",
      "CLASSES_VIEW", "SUBJECTS_VIEW", "ENROLLMENTS_VIEW",
      "SCORES_VIEW", "SCORES_ENTER",
      "ATTENDANCE_VIEW", "ATTENDANCE_MARK",
      "NOTIFICATIONS_VIEW",
    ],
  },
  {
    name: "Subject Teacher", isSystem: true, color: "emerald",
    description: "Handles scoring and attendance for assigned subjects.",
    permissions: ["SUBJECTS_VIEW", "SCORES_VIEW", "SCORES_ENTER", "ATTENDANCE_VIEW", "NOTIFICATIONS_VIEW"],
  },
  {
    name: "Student", isSystem: true, color: "amber",
    description: "Views their own academic information.",
    permissions: ["SCORES_VIEW", "ATTENDANCE_VIEW", "REPORTS_VIEW", "NOTIFICATIONS_VIEW"],
  },
  {
    name: "Parent", isSystem: true, color: "amber",
    description: "Monitors one or more children's academic progress.",
    permissions: ["SCORES_VIEW", "ATTENDANCE_VIEW", "REPORTS_VIEW", "NOTIFICATIONS_VIEW"],
  },
];

const ensureSystemRolesSeeded = async () => {
  const count = await prisma.roleDefinition.count({ where: { isSystem: true } });
  if (count >= SYSTEM_ROLES.length) return;

  for (const role of SYSTEM_ROLES) {
    await prisma.roleDefinition.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
};

const getPermissionCatalogue = async () => {
  return { groups: PERMISSION_GROUPS };
};

const getRoles = async () => {
  await ensureSystemRolesSeeded();
  return prisma.roleDefinition.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
};

const createRole = async ({ name, description, color, permissions }) => {
  if (!name || !name.trim()) throw createError("Role name is required.", 400);

  const existing = await prisma.roleDefinition.findUnique({ where: { name: name.trim() } });
  if (existing) throw createError(`A role named "${name}" already exists.`, 409);

  return prisma.roleDefinition.create({
    data: {
      name: name.trim(),
      description: description || null,
      color: color || "blue",
      permissions: permissions || [],
      isSystem: false,
    },
  });
};

const updateRole = async (id, { permissions, description, color }) => {
  const role = await prisma.roleDefinition.findUnique({ where: { id } });
  if (!role) throw createError("Role not found.", 404);
  if (role.isSystem) throw createError("System roles cannot be modified.", 403);

  return prisma.roleDefinition.update({
    where: { id },
    data: {
      ...(permissions !== undefined && { permissions }),
      ...(description !== undefined && { description }),
      ...(color !== undefined && { color }),
    },
  });
};

const deleteRole = async (id) => {
  const role = await prisma.roleDefinition.findUnique({ where: { id } });
  if (!role) throw createError("Role not found.", 404);
  if (role.isSystem) throw createError("System roles cannot be deleted.", 403);

  await prisma.roleDefinition.delete({ where: { id } });
  return { id, deleted: true };
};

module.exports = { getPermissionCatalogue, getRoles, createRole, updateRole, deleteRole };