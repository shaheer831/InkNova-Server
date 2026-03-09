/**
 * config/permissions.js
 *
 * Granular permission strings used throughout the app.
 * Format: <action>-<resource>  (kebab-case, lowercase)
 *
 * These are the ONLY valid permissions. Anything not in this list
 * will be rejected by validatePermissions().
 */

export const VALID_PERMISSIONS = [
  // ── Books ──────────────────────────────────────
  "view-books",
  "add-books",
  "edit-books",
  "delete-books",
  "publish-books",       // toggle draft → published → archived

  // ── Categories ─────────────────────────────────
  "view-categories",
  "add-categories",
  "edit-categories",
  "delete-categories",

  // ── Orders ─────────────────────────────────────
  "view-orders",
  "edit-orders",         // update status, mark COD collected
  "delete-orders",
  "cancel-orders",

  // ── Inventory ──────────────────────────────────
  "view-inventory",
  "add-inventory",
  "edit-inventory",
  "delete-inventory",
  "adjust-stock",

  // ── Production ─────────────────────────────────
  "view-production",
  "add-production",
  "edit-production",
  "delete-production",

  // ── Vendors ────────────────────────────────────
  "view-vendors",
  "add-vendors",
  "edit-vendors",
  "delete-vendors",

  // ── Materials ──────────────────────────────────
  "view-materials",
  "add-materials",
  "edit-materials",
  "delete-materials",

  // ── Discounts ──────────────────────────────────
  "view-discounts",
  "add-discounts",
  "edit-discounts",
  "delete-discounts",

  // ── Users ──────────────────────────────────────
  "view-users",
  "add-users",
  "edit-users",
  "delete-users",
  "assign-roles",          // assign roleId to a user
  "assign-permissions",    // assign direct permissions to a user
  "reset-passwords",

  // ── Roles ──────────────────────────────────────
  "view-roles",
  "add-roles",
  "edit-roles",
  "delete-roles",

  // ── Reports / Dashboard ────────────────────────
  "view-reports",
  "view-dashboard",

  // ── Activity Logs ──────────────────────────────
  "view-logs",
];

/**
 * Returns array of invalid permission strings.
 * Empty array means all are valid.
 */
export const validatePermissions = (perms = []) =>
  perms.filter((p) => !VALID_PERMISSIONS.includes(p));

/**
 * Preset bundles for convenience when seeding roles.
 * These are NOT enforced anywhere — just helpers.
 */
export const PERMISSION_PRESETS = {
  CONTENT_EDITOR: [
    "view-books", "add-books", "edit-books", "publish-books",
    "view-categories", "add-categories", "edit-categories",
  ],
  ORDER_MANAGER: [
    "view-orders", "edit-orders", "cancel-orders",
    "view-inventory", "adjust-stock",
  ],
  WAREHOUSE: [
    "view-inventory", "add-inventory", "edit-inventory", "adjust-stock",
    "view-production", "add-production", "edit-production",
    "view-materials", "add-materials", "edit-materials",
    "view-vendors", "add-vendors", "edit-vendors",
  ],
  REPORTS_VIEWER: [
    "view-reports", "view-dashboard", "view-logs",
  ],
};