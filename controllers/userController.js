/**
 * controllers/userController.js
 * User management endpoints (admin-facing and profile routes).
 *
 * Changes:
 *  - role field removed; only roleId (ObjectId) is used
 *  - assignRole now takes roleId only (no string role field)
 *  - deleteUser and bulkDeleteUsers block deletion of the superadmin
 *  - toggleUserStatus blocks deactivating superadmin
 *  - listUsers filter by roleId (ObjectId) not role string
 *  - effective permissions returned in login/get responses
 */
import bcrypt from "bcrypt";
import { User, ActivityLog, Role } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity, validatePassword } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, keywordFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";
import { validatePermissions } from "../config/permissions.js";
import { isSuperAdmin } from "../middlewares/auth.js";

const SALT = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

const isOwnerOrSuperAdmin = (req, paramId) =>
  isSuperAdmin(req.user) ||
  req.user._id.toString() === paramId.toString() ||
  req.user.hasPermission("view-users");

/* ── Create user ──────────────────────────────────── */
export const createUser = async (req, res) => {
  try {
    const { name, email, password, roleId, permissions } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 400, "Name, email and password required");
    }

    if (!req.file) {
      return sendError(res, 400, "Profile picture is required");
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return sendError(res, 409, "Email already in use");

    // Validate roleId if provided
    if (roleId) {
      const roleExists = await Role.findById(roleId);
      if (!roleExists) return sendError(res, 400, "Invalid roleId — role not found");
    }

    // Validate direct permissions if provided
    if (permissions?.length) {
      const invalid = validatePermissions(permissions);
      if (invalid.length) return sendError(res, 400, `Invalid permissions: ${invalid.join(", ")}`);
    }

    const pwError = validatePassword(password);
    if (pwError) return sendError(res, 400, pwError);

    const passwordHash = await bcrypt.hash(password, SALT);

    const picture = {
      url: `/uploads/avatars/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
    };

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      roleId: roleId || null,
      permissions: permissions || [],
      picture,
    });

    const populated = await user.populate("roleId", "name permissions");

    return sendSuccess(res, 201, "User created", {
      _id: populated._id,
      name: populated.name,
      email: populated.email,
      roleId: populated.roleId,
      permissions: populated.permissions,
      effectivePermissions: populated.getEffectivePermissions(),
      picture: populated.picture,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

/* ── Get user by ID ───────────────────────────────── */
export const getUserById = asyncHandler(async (req, res) => {
  if (!isOwnerOrSuperAdmin(req, req.params.id)) {
    return sendError(res, 403, "Access denied");
  }

  const user = await User.findById(req.params.id)
    .select("-passwordHash -refreshToken")
    .populate("roleId", "name permissions");

  if (!user) return sendError(res, 404, "User not found");

  const userObj = user.toObject();
  userObj.effectivePermissions = user.getEffectivePermissions();
  return sendSuccess(res, 200, "User retrieved", userObj);
});

/* ── Update user profile ──────────────────────────── */
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 404, "User not found");

  const allowedUpdates = ["name", "email"];
  const updates = {};
  allowedUpdates.forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  if (req.file) {
    updates.picture = {
      url: `/uploads/avatars/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
    };
  }

  Object.assign(user, updates);
  await user.save();
  await logActivity(req.user._id, "UPDATE", "User", user._id);

  return sendSuccess(res, 200, "User updated", {
    _id: user._id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
    permissions: user.permissions,
    picture: user.picture,
  });
});

/* ── Delete user ──────────────────────────────────── */
export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 404, "User not found");

  if (isSuperAdmin(user)) {
    return sendError(res, 403, "The super admin account cannot be deleted");
  }

  await user.deleteOne();
  await logActivity(req.user._id, "DELETE", "User", req.params.id);
  return sendSuccess(res, 200, "User deleted");
});

/* ── Bulk delete ──────────────────────────────────── */
export const bulkDeleteUsers = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids array required");

  // Prevent superadmin deletion
  const superAdminUser = await User.findOne({
    _id: { $in: ids },
    email: process.env.SUPER_ADMIN_EMAIL?.toLowerCase(),
  });
  if (superAdminUser) {
    return sendError(res, 403, "The super admin account cannot be deleted");
  }

  const result = await User.deleteMany({ _id: { $in: ids } });
  await logActivity(req.user._id, "BULK_DELETE", "User", ids.join(","));
  return sendSuccess(res, 200, `${result.deletedCount} users deleted`);
});

/* ── List users ───────────────────────────────────── */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { roleId, isActive, search, dateFrom, dateTo } = req.query;

  // Filter by roleId (ObjectId) — not a string role anymore
  const eqFilter = fieldFilter({ roleId, isActive }, ["roleId", "isActive"]);
  const searchFilter = keywordFilter(search, ["name", "email"]);
  const dateFilter = dateRangeFilter(dateFrom, dateTo);

  const filter = mergeFilters(
    eqFilter,
    searchFilter,
    dateFilter ? { createdAt: dateFilter } : null
  );

  const { data, meta } = await paginateQuery(User, filter, {
    page,
    limit,
    skip,
    sortBy,
    order,
    select: "-passwordHash -refreshToken",
    populate: [{ path: "roleId", select: "name permissions" }],
  });

  // Append effectivePermissions to each user safely
  const enriched = data.map((u) => {
    const obj = u.toObject ? u.toObject() : { ...u };
    const rolePerms = obj.roleId?.permissions || [];
    const directPerms = obj.permissions || [];
    obj.effectivePermissions = [...new Set([...rolePerms, ...directPerms])];
    return obj;
  });

  return sendSuccess(res, 200, "Users retrieved", enriched, meta);
});

/* ── List all users (no pagination — for dropdowns) ── */
export const listUsersAll = asyncHandler(async (req, res) => {
  const users = await User.find()
    .select("_id name email isActive roleId")
    .populate("roleId", "name")
    .sort({ name: 1 });
  return sendSuccess(res, 200, "All users retrieved", users);
});

/* ── Change password ──────────────────────────────── */
export const changePassword = asyncHandler(async (req, res) => {
  if (!isOwnerOrSuperAdmin(req, req.params.id)) {
    return sendError(res, 403, "Access denied");
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return sendError(res, 400, "Both passwords required");

  const pwError = validatePassword(newPassword);
  if (pwError) return sendError(res, 400, pwError);

  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 404, "User not found");

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) return sendError(res, 400, "Current password is incorrect");

  user.passwordHash = await bcrypt.hash(newPassword, SALT);
  await user.save();

  await logActivity(req.user._id, "CHANGE_PASSWORD", "User", user._id);
  return sendSuccess(res, 200, "Password updated");
});

/* ── Toggle user status ───────────────────────────── */
export const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 404, "User not found");

  if (isSuperAdmin(user)) {
    return sendError(res, 403, "The super admin account cannot be deactivated");
  }

  user.isActive = !user.isActive;
  await user.save();

  await logActivity(req.user._id, user.isActive ? "ACTIVATE" : "DEACTIVATE", "User", user._id);
  return sendSuccess(res, 200, `User ${user.isActive ? "activated" : "deactivated"}`);
});

/* ── Assign direct permissions to user ───────────── */
export const assignPermissions = asyncHandler(async (req, res) => {
  const { permissions } = req.body;
  if (!Array.isArray(permissions)) return sendError(res, 400, "permissions must be an array");

  const invalid = validatePermissions(permissions);
  if (invalid.length) return sendError(res, 400, `Invalid permissions: ${invalid.join(", ")}`);

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { permissions },
    { new: true, runValidators: true }
  )
    .select("-passwordHash")
    .populate("roleId", "name permissions");

  if (!user) return sendError(res, 404, "User not found");

  await logActivity(req.user._id, "ASSIGN_PERMISSIONS", "User", user._id);
  return sendSuccess(res, 200, "Permissions updated", {
    permissions: user.permissions,
    effectivePermissions: user.getEffectivePermissions(),
  });
});

/* ── Assign role to user (by roleId ObjectId) ─────── */
export const assignRole = asyncHandler(async (req, res) => {
  const { roleId } = req.body;

  if (!roleId) return sendError(res, 400, "roleId is required");

  const role = await Role.findById(roleId);
  if (!role) return sendError(res, 400, "Role not found");

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { roleId },
    { new: true, runValidators: true }
  )
    .select("-passwordHash")
    .populate("roleId", "name permissions");

  if (!user) return sendError(res, 404, "User not found");

  await logActivity(req.user._id, "ASSIGN_ROLE", "User", user._id, { roleId, roleName: role.name });
  return sendSuccess(res, 200, "Role assigned", {
    roleId: user.roleId,
    effectivePermissions: user.getEffectivePermissions(),
  });
});

/* ── Remove role from user ────────────────────────── */
export const removeRole = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $unset: { roleId: "" } },
    { new: true }
  ).select("-passwordHash");

  if (!user) return sendError(res, 404, "User not found");

  await logActivity(req.user._id, "REMOVE_ROLE", "User", user._id);
  return sendSuccess(res, 200, "Role removed from user");
});

/* ── Admin reset password ─────────────────────────── */
export const resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return sendError(res, 400, "newPassword required");

  const pwError = validatePassword(newPassword);
  if (pwError) return sendError(res, 400, pwError);

  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 404, "User not found");

  user.passwordHash = await bcrypt.hash(newPassword, SALT);
  await user.save();

  await logActivity(req.user._id, "RESET_PASSWORD", "User", user._id);
  return sendSuccess(res, 200, "Password reset successfully");
});

/* ── User activity history ────────────────────────── */
export const getUserActivity = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);

  const { data, meta } = await paginateQuery(
    ActivityLog,
    { userId: req.params.id },
    { page, limit, skip, sortBy: sortBy || "createdAt", order, populate: [] }
  );

  return sendSuccess(res, 200, "Activity retrieved", data, meta);
});