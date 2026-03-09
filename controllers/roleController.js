/**
 * controllers/roleController.js
 * Role management — fully dynamic, superadmin-protected.
 *
 * Rules:
 *  - Only superadmin can manage roles (create / update / delete)
 *  - System roles (isSystem: true) cannot be deleted
 *  - VALID_PERMISSIONS list is the source of truth; invalid perms are rejected
 */
import { Role, User } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { keywordFilter } from "../utils/filters.js";
import { validatePermissions, VALID_PERMISSIONS } from "../config/permissions.js";

/* ── Create role ──────────────────────────────────── */
export const createRole = asyncHandler(async (req, res) => {
  const { name, permissions = [] } = req.body;
  if (!name) return sendError(res, 400, "Role name is required");

  const invalid = validatePermissions(permissions);
  if (invalid.length) return sendError(res, 400, `Invalid permissions: ${invalid.join(", ")}`);

  const existing = await Role.findOne({ name: name.trim() });
  if (existing) return sendError(res, 409, "A role with this name already exists");

  const role = await Role.create({ name: name.trim(), permissions });
  await logActivity(req.user._id, "CREATE", "Role", role._id);
  return sendSuccess(res, 201, "Role created", role);
});

/* ── Get role by ID ───────────────────────────────── */
export const getRoleById = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return sendError(res, 404, "Role not found");
  return sendSuccess(res, 200, "Role retrieved", role);
});

/* ── Update role ──────────────────────────────────── */
export const updateRole = asyncHandler(async (req, res) => {
  const { name, permissions } = req.body;

  if (permissions) {
    const invalid = validatePermissions(permissions);
    if (invalid.length) return sendError(res, 400, `Invalid permissions: ${invalid.join(", ")}`);
  }

  const updates = {};
  if (name !== undefined) updates.name = name.trim();
  if (permissions !== undefined) updates.permissions = permissions;

  const role = await Role.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!role) return sendError(res, 404, "Role not found");

  await logActivity(req.user._id, "UPDATE", "Role", role._id);
  return sendSuccess(res, 200, "Role updated", role);
});

/* ── Delete role ──────────────────────────────────── */
export const deleteRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return sendError(res, 404, "Role not found");

  if (role.isSystem) {
    return sendError(res, 403, "System roles cannot be deleted");
  }

  await role.deleteOne();

  // Unassign this role from all users who had it
  await User.updateMany({ roleId: req.params.id }, { $unset: { roleId: "" } });

  await logActivity(req.user._id, "DELETE", "Role", req.params.id);
  return sendSuccess(res, 200, "Role deleted");
});

/* ── Bulk delete roles ────────────────────────────── */
export const bulkDeleteRoles = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids required");

  // Prevent deleting system roles
  const systemRoles = await Role.find({ _id: { $in: ids }, isSystem: true }).select("name");
  if (systemRoles.length) {
    return sendError(
      res,
      403,
      `Cannot delete system roles: ${systemRoles.map((r) => r.name).join(", ")}`
    );
  }

  const result = await Role.deleteMany({ _id: { $in: ids } });
  await User.updateMany({ roleId: { $in: ids } }, { $unset: { roleId: "" } });
  await logActivity(req.user._id, "BULK_DELETE", "Role", ids.join(","));
  return sendSuccess(res, 200, `${result.deletedCount} roles deleted`);
});

/* ── List roles (paginated) ───────────────────────── */
export const listRoles = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { search } = req.query;
  const filter = keywordFilter(search, ["name"]) || {};

  const { data, meta } = await paginateQuery(Role, filter, { page, limit, skip, sortBy, order });
  return sendSuccess(res, 200, "Roles retrieved", data, meta);
});

/* ── List all roles (no pagination — for dropdowns) ── */
export const listRolesAll = asyncHandler(async (req, res) => {
  const roles = await Role.find().sort({ name: 1 }).select("_id name permissions isSystem");
  return sendSuccess(res, 200, "All roles retrieved", roles);
});

/* ── List all valid permissions ───────────────────── */
export const listAvailablePermissions = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Available permissions", VALID_PERMISSIONS);
});