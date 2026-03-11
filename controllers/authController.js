/**
 * controllers/authController.js
 * Authentication: register, login, refresh, logout.
 *
 * Changes:
 *  - No "role" string on User; roleId (ObjectId) used instead
 *  - Login response includes effectivePermissions (role + direct)
 *  - Register creates user with no role by default
 */
import bcrypt from "bcrypt";
import { User } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, validatePassword } from "../utils/helpers.js";
import {
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  invalidateRefreshToken,
} from "../services/tokenService.js";
import { handleFailedLogin, handleSuccessfulLogin } from "../middlewares/loginProtection.js";

/* ── POST /api/auth/register ──────────────────────── */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return sendError(res, 400, "Name, email, and password are required");
  }

  const pwError = validatePassword(password);
  if (pwError) return sendError(res, 400, pwError);

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return sendError(res, 409, "Email already registered");

  const passwordHash = await bcrypt.hash(
    password,
    parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12
  );

  // Find or create the customer role
  let customerRole = await Role.findOne({ name: /^customer$/i });
  if (!customerRole) {
    customerRole = await Role.create({ name: "customer", permissions: [] });
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    roleId: customerRole._id,
    permissions: [],
  });

  const populated = await user.populate("roleId", "name permissions");

  const accessToken = generateAccessToken(user._id);
  const refreshToken = await generateRefreshToken(user._id);

  return sendSuccess(res, 201, "Registration successful", {
    accessToken,
    refreshToken,
    user: {
      _id: populated._id,
      name: populated.name,
      email: populated.email,
      roleId: populated.roleId,
      permissions: populated.permissions,
      effectivePermissions: populated.getEffectivePermissions(),
    },
  });
});
/* ── POST /api/auth/login ─────────────────────────── */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return sendError(res, 400, "Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).populate(
    "roleId",
    "name permissions"
  );

  if (!user) return sendError(res, 401, "Invalid credentials");

  if (user.lockUntil && user.lockUntil > Date.now()) {
    const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    return sendError(res, 429, `Account locked. Try again in ${minutes} minute(s)`);
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    await handleFailedLogin(user);
    return sendError(res, 401, "Invalid credentials");
  }

  if (!user.isActive) return sendError(res, 403, "Account is deactivated");

  await handleSuccessfulLogin(user);

  const accessToken = generateAccessToken(user._id);
  const refreshToken = await generateRefreshToken(user._id);

  return sendSuccess(res, 200, "Login successful", {
    accessToken,
    refreshToken,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      picture: user.picture,
      roleId: user.roleId,
      permissions: user.permissions,
      effectivePermissions: user.getEffectivePermissions(),
    },
  });
});

/* ── POST /api/auth/refresh ───────────────────────── */
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return sendError(res, 400, "Refresh token required");

  const {
    accessToken,
    refreshToken: newRefreshToken,
    user,
  } = await refreshAccessToken(refreshToken);

  return sendSuccess(res, 200, "Token refreshed", {
    accessToken,
    refreshToken: newRefreshToken,
    user: { _id: user._id, name: user.name, email: user.email },
  });
});

/* ── POST /api/auth/logout ────────────────────────── */
export const logout = asyncHandler(async (req, res) => {
  await invalidateRefreshToken(req.user._id);
  return sendSuccess(res, 200, "Logged out successfully");
});