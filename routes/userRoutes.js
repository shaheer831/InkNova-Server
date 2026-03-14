/**
 * routes/userRoutes.js
 */
import { Router } from "express";
import {
  createUser, getUserById, updateUser, deleteUser, listUsers, listUsersAll,
  bulkDeleteUsers, changePassword, toggleUserStatus,
  assignPermissions, assignRole, removeRole, resetPassword, getUserActivity,
} from "../controllers/userController.js";
import { verifyToken, requireSuperAdmin, requirePermission } from "../middlewares/auth.js";
import { avatarUpload } from "../middlewares/upload.js";

const router = Router();

router.use(verifyToken);

router.get("/all", requirePermission("view-users"), listUsersAll);
router.get("/", requirePermission("view-users"), listUsers);
router.post("/", requirePermission("add-users"), avatarUpload, createUser);
router.delete("/bulk", requirePermission("delete-users"), bulkDeleteUsers);

router.get("/:id", getUserById);
router.put("/:id", avatarUpload, updateUser);
router.delete("/:id", requirePermission("delete-users"), deleteUser);

router.post("/:id/change-password", changePassword);
router.patch("/:id/toggle-status", requirePermission("edit-users"), toggleUserStatus);
router.put("/:id/permissions", requirePermission("assign-permissions"), assignPermissions);
router.put("/:id/role", requirePermission("assign-roles"), assignRole);
router.delete("/:id/role", requirePermission("assign-roles"), removeRole);
router.post("/:id/reset-password", requirePermission("reset-passwords"), resetPassword);
router.get("/:id/activity", requirePermission("view-logs"), getUserActivity);

export default router;