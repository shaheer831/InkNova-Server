/**
 * config/permissions.js
 * InkNova — Digital Reading Platform Permission Registry
 */

export const VALID_PERMISSIONS = [
  // Books
  "view-books", "add-books", "edit-books", "delete-books", "publish-books",
  // Chapters
  "view-chapters", "add-chapters", "edit-chapters", "delete-chapters", "publish-chapters",
  // Series
  "view-series", "add-series", "edit-series", "delete-series", "publish-series",
  // Genres
  "view-genres", "add-genres", "edit-genres", "delete-genres",
  // Users
  "view-users", "add-users", "edit-users", "delete-users",
  "assign-roles", "assign-permissions", "reset-passwords",
  // Reviews
  "view-reviews", "moderate-reviews", "delete-reviews",
  // Roles
  "view-roles", "add-roles", "edit-roles", "delete-roles",
  // Reports / Dashboard
  "view-reports", "view-dashboard",
  // Logs
  "view-logs",
  // Notifications
  "send-notifications",
  // Discounts
  "view-discounts", "add-discounts", "edit-discounts", "delete-discounts",
];

export const validatePermissions = (perms = []) =>
  perms.filter((p) => !VALID_PERMISSIONS.includes(p));

export const PERMISSION_PRESETS = {
  CONTENT_EDITOR: [
    "view-books", "add-books", "edit-books", "publish-books",
    "view-chapters", "add-chapters", "edit-chapters", "publish-chapters",
    "view-series", "add-series", "edit-series", "publish-series",
    "view-genres", "add-genres", "edit-genres",
  ],
  MODERATOR: [
    "view-books", "view-chapters", "view-series",
    "view-reviews", "moderate-reviews", "delete-reviews",
    "view-users",
  ],
  REPORTS_VIEWER: ["view-reports", "view-dashboard", "view-logs"],
};
