/**
 * middlewares/auth.js
 *
 * Authentication & authorization middleware.
 *
 * Key design:
 *  - verifyToken      – validates JWT, attaches req.user (with roleId populated)
 *  - requirePermission(perm) – checks effective permissions (role + direct)
 *  - isSuperAdmin     – util to identify the env-protected superadmin
 *  - requireSuperAdmin – only the .env superadmin may pass
 *
 * There is NO requireAdmin that checks a hardcoded "admin" string.
 * All access is permission-based. Superadmin bypass is env-email-based only.
 */
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { sendError } from "../utils/response.js";

/* ── Identify superadmin by env email ───────────── */
export const isSuperAdmin = (user) =>
  user?.email?.toLowerCase() === process.env.SUPER_ADMIN_EMAIL?.toLowerCase();

/* ── Verify JWT and populate user + role ─────────── */
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return sendError(res, 401, "No token provided");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Always populate roleId so getEffectivePermissions() works
    // tokenService signs with { id: ... } so we support both decoded.id and decoded.userId
    const userId = decoded.id || decoded.userId;
    const user = await User.findById(userId)
      .select("-passwordHash -refreshToken")
      .populate("roleId", "name permissions");

    if (!user) return sendError(res, 401, "User not found");
    if (!user.isActive) return sendError(res, 403, "Account is deactivated");

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return sendError(res, 401, "Token expired");
    }
    return sendError(res, 401, "Invalid token");
  }
};

/* ── Require a specific permission ───────────────── */
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return sendError(res, 401, "Unauthorized");

  // Superadmin bypasses all permission checks
  if (isSuperAdmin(req.user)) return next();

  if (!req.user.hasPermission(permission)) {
    return sendError(res, 403, `Permission required: ${permission}`);
  }
  next();
};

/* ── Require ANY of multiple permissions ─────────── */
export const requireAnyPermission = (...permissions) => (req, res, next) => {
  if (!req.user) return sendError(res, 401, "Unauthorized");
  if (isSuperAdmin(req.user)) return next();

  const has = permissions.some((p) => req.user.hasPermission(p));
  if (!has) {
    return sendError(res, 403, `One of these permissions required: ${permissions.join(", ")}`);
  }
  next();
};

/* ── Require ALL of multiple permissions ─────────── */
export const requireAllPermissions = (...permissions) => (req, res, next) => {
  if (!req.user) return sendError(res, 401, "Unauthorized");
  if (isSuperAdmin(req.user)) return next();

  const missing = permissions.filter((p) => !req.user.hasPermission(p));
  if (missing.length) {
    return sendError(res, 403, `Missing permissions: ${missing.join(", ")}`);
  }
  next();
};

/* ── SuperAdmin only ──────────────────────────────── */
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user) return sendError(res, 401, "Unauthorized");
  if (!isSuperAdmin(req.user)) {
    return sendError(res, 403, "Super admin access required");
  }
  next();
};

/* ── Optional auth (attaches user if token present) ── */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return next();

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const userId = decoded.id || decoded.userId;
    const user = await User.findById(userId)
      .select("-passwordHash -refreshToken")
      .populate("roleId", "name permissions");

    if (user?.isActive) req.user = user;
  } catch (_) {
    // silently ignore invalid / expired token in optional auth
  }
  next();
};