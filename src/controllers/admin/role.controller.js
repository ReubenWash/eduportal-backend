const roleService = require("../../services/admin/role.service");
const { sendSuccess } = require("../../utils/apiResponse");

// GET /api/v1/admin/roles/permissions
const getPermissionCatalogue = async (req, res) => {
  const catalogue = await roleService.getPermissionCatalogue();
  return sendSuccess(res, 200, "Permission catalogue fetched.", catalogue);
};

// GET /api/v1/admin/roles
const getRoles = async (req, res) => {
  const roles = await roleService.getRoles();
  return sendSuccess(res, 200, "Roles fetched.", roles);
};

// POST /api/v1/admin/roles
const createRole = async (req, res) => {
  const role = await roleService.createRole(req.body);
  return sendSuccess(res, 201, "Role created.", role);
};

// PATCH /api/v1/admin/roles/:id
const updateRole = async (req, res) => {
  const role = await roleService.updateRole(req.params.id, req.body);
  return sendSuccess(res, 200, "Role updated.", role);
};

// DELETE /api/v1/admin/roles/:id
const deleteRole = async (req, res) => {
  const result = await roleService.deleteRole(req.params.id);
  return sendSuccess(res, 200, "Role deleted.", result);
};

module.exports = { getPermissionCatalogue, getRoles, createRole, updateRole, deleteRole };
