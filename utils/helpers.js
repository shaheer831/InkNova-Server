/**
 * utils/helpers.js
 * Shared utility functions:
 *   - asyncHandler: wraps async route handlers to catch errors
 *   - logActivity: records user actions to ActivityLog collection
 *   - slugify: generates URL-safe slugs
 */
import { ActivityLog } from "../models/index.js";
import logger from "./logger.js";

/**
 * Wrap an async Express handler so errors are forwarded to next().
 * Usage: router.get("/", asyncHandler(async (req, res) => { ... }))
 *
 * @param {Function} fn - Async route handler
 * @returns {Function} Express middleware
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Record an activity log entry.
 * Fails silently so it never breaks the main request.
 *
 * @param {string|ObjectId} userId
 * @param {string} action - e.g. "CREATE", "UPDATE", "DELETE"
 * @param {string} entity - e.g. "Book", "User", "Order"
 * @param {string} entityId - String version of the entity's _id
 * @param {object} meta - Optional extra data
 */
export const logActivity = async (userId, action, entity, entityId, meta = {}) => {
  try {
    await ActivityLog.create({ userId, action, entity, entityId: String(entityId), meta });
  } catch (err) {
    logger.error(`Failed to log activity: ${err.message}`);
  }
};

/**
 * Convert a string to a URL-safe slug.
 * @param {string} text
 * @returns {string}
 */
export const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

/**
 * Validate password complexity.
 * Returns an error message string if invalid, or null if valid.
 * @param {string} password
 * @returns {string|null}
 */
export const validatePassword = (password) => {
  if (!password || password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one digit";
  return null;
};
