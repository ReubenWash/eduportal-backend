const { prisma }      = require("../config/db");
const { createError } = require("../middleware/errorHandler");

// Canonical permission catalogue — kept in sync with the frontend's
// PERMISSIONS map in AdminRoles.jsx. Exposed via GET /admin/roles/permissions
// so the frontend can render checkboxes without hardcoding this list twice.
const PERMISSION_GROUPS = {
  "School Management": ["view_schools", "create_schools", "edit_schools", "delete_schools", "approve_schools", "suspend_schools"],
  "User Management":   ["view_users", "create_users", "edit_users", "delete_users", "suspend_users", "reset_passwords"],
  "Academic":          ["view_classes", "manage_classes", "view_students", "manage_students", "view_scores", "manage_scores", "view_attendance", "manage_attendance"],
  "Reports":           ["view_reports", "generate_reports", "download_reports", "delete_reports"],
  "Billing":           ["view_subscriptions", "manage_plans", "view_payments", "manage_payments"],
  "System":            ["manage_settings", "manage_integrations", "view_audit_logs", "manage_backups", "maintenance_mode"],
  "Support":           ["view_tickets", "manage_tickets", "view_feedback", "manage_announcements"],
};
const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flat();

const DEFAULT_ROLES = [
  { name: "Super Admin",     description: "Full platform access",              color: "indigo",  isSystem: true,  permissions: ALL_PERMISSIONS },
  { name: "School Admin",    description: "Manages their school only",         color: "violet",  isSystem: false, permissions: ["view_schools","view_users","create_users","edit_users","view_classes","manage_classes","view_students","manage_students","view_scores","manage_scores","view_attendance","manage_attendance","view_reports","generate_reports","download_reports"] },
  { name: "Class Teacher",   description: "Manages assigned classes",          color: "emerald", isSystem: false, permissions: ["view_students","view_scores","manage_scores","view_attendance","manage_attendance","view_reports"] },
  { name: "Subject Teacher", description: "Scores and attendance only",        color: "amber",   isSystem: false, permissions: ["view_students","view_scores","manage_scores","view_attendance","manage_attendance"] },
  { name: "Support Staff",   description: "Platform support access",           color: "blue",    isSystem: false, permissions: ["view_tickets","manage_tickets","view_feedback"] },
];

const ensureSeeded = async () => {
  const count = await prisma.customRole.count();
  if (count > 0) return;
  await prisma.customRole.createMany({ data: DEFAULT_ROLES });
};

const getPermissionCatalogue = () => ({ groups: PERMISSION_GROUPS, all: ALL_PERMISSIONS });

const getRoles = async () => {
  await ensureSeeded();
  return prisma.customRole.findMany({ orderBy: { createdAt: "asc" } });
};

const createRole = async (data) => {
  const { name, description, color, permissions } = data;
  if (!name || !name.trim()) throw createError("Role name is required.", 400);

  const existing = await prisma.customRole.findUnique({ where: { name } });
  if (existing) throw createError(`A role named "${name}" already exists.`, 409);

  const invalid = (permissions || []).filter((p) => !ALL_PERMISSIONS.includes(p));
  if (invalid.length) throw createError(`Unknown permission(s): ${invalid.join(", ")}`, 400);

  return prisma.customRole.create({
    data: {
      name,
      description: description || null,
      color: color || "blue",
      isSystem: false,
      permissions: permissions || [],
    },
  });
};

const updateRole = async (id, data) => {
  const role = await prisma.customRole.findUnique({ where: { id } });
  if (!role) throw createError("Role not found.", 404);
  if (role.isSystem) throw createError("System roles cannot be modified.", 403);

  const { name, description, color, permissions } = data;
  if (permissions) {
    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length) throw createError(`Unknown permission(s): ${invalid.join(", ")}`, 400);
  }

  return prisma.customRole.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(color !== undefined && { color }),
      ...(permissions !== undefined && { permissions }),
    },
  });
};

const deleteRole = async (id) => {
  const role = await prisma.customRole.findUnique({ where: { id } });
  if (!role) throw createError("Role not found.", 404);
  if (role.isSystem) throw createError("System roles cannot be deleted.", 403);

  await prisma.customRole.delete({ where: { id } });
  return { id, deleted: true };
};

module.exports = { getPermissionCatalogue, getRoles, createRole, updateRole, deleteRole };
