/**
 * routes/roleRoutes.js
 * Only superadmin can manage roles.
 */
import { Router } from "express";
import {
  createRole, getRoleById, updateRole, deleteRole,
  listRoles, listRolesAll, bulkDeleteRoles, listAvailablePermissions,
} from "../controllers/roleController.js";
import { verifyToken, requireSuperAdmin, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

// Any user with view-roles can read; only superadmin can mutate
router.get("/permissions", requirePermission("view-roles"), listAvailablePermissions);
router.get("/all", requirePermission("view-roles"), listRolesAll);
router.get("/", requirePermission("view-roles"), listRoles);
router.get("/:id", requirePermission("view-roles"), getRoleById);

router.post("/", requireSuperAdmin, createRole);
router.put("/:id", requireSuperAdmin, updateRole);
router.delete("/bulk", requireSuperAdmin, bulkDeleteRoles);
router.delete("/:id", requireSuperAdmin, deleteRole);

export default router;