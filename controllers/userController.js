/**
 * controllers/userController.js
 * User management endpoints (admin-facing and profile routes).
 *
 * Users are treated as customers — no roleId, no permissions assignment.
 * Role/permission management is handled separately for staff/admin accounts.
 */
import bcrypt from "bcrypt";
import { User, ActivityLog } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity, validatePassword } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, keywordFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";
import { isSuperAdmin } from "../middlewares/auth.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const SALT = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const isProduction = process.env.NODE_ENV === "production";

const isOwnerOrSuperAdmin = (req, paramId) =>
  isSuperAdmin(req.user) ||
  req.user._id.toString() === paramId.toString() ||
  req.user.hasPermission("view-users");

/**
 * Build picture object from uploaded file.
 * In production: uploads buffer to Cloudinary and returns the CDN url.
 * In development: returns local disk path.
 */
const buildPictureData = async (file) => {
  if (!file) return null;

  if (isProduction) {
    const { url, publicId } = await uploadToCloudinary(file.buffer, {
      folder: "inknova/avatars",
      mimetype: file.mimetype,
    });
    return { url, publicId, originalName: file.originalname, size: file.size };
  }

  return {
    url: `/uploads/avatars/${file.filename}`,
    originalName: file.originalname,
    size: file.size,
  };
};

/* ── Create user (customer) ───────────────────────── */
export const createUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return sendError(res, 400, "Name, email and password required");
    }

    if (!req.file) {
      return sendError(res, 400, "Profile picture is required");
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return sendError(res, 409, "Email already in use");

    const pwError = validatePassword(password);
    if (pwError) return sendError(res, 400, pwError);

    const passwordHash = await bcrypt.hash(password, SALT);
    const picture = await buildPictureData(req.file);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      picture,
    });

    return sendSuccess(res, 201, "User created", {
      _id: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture,
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
    .select("-passwordHash -refreshToken");

  if (!user) return sendError(res, 404, "User not found");

  return sendSuccess(res, 200, "User retrieved", user.toObject());
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
    updates.picture = await buildPictureData(req.file);
  }

  Object.assign(user, updates);
  await user.save();
  await logActivity(req.user._id, "UPDATE", "User", user._id);

  return sendSuccess(res, 200, "User updated", {
    _id: user._id,
    name: user.name,
    email: user.email,
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
  const { isActive, search, dateFrom, dateTo } = req.query;

  const eqFilter = fieldFilter({ isActive }, ["isActive"]);
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
  });

  return sendSuccess(res, 200, "Users retrieved", data, meta);
});

/* ── List all users (no pagination — for dropdowns) ── */
export const listUsersAll = asyncHandler(async (req, res) => {
  const users = await User.find()
    .select("_id name email isActive")
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