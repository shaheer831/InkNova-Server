
/**
 * routes/categoryRoutes.js
 */
import { Router } from "express";
import {
  createCategory, getCategoryById, updateCategory, deleteCategory,
  listCategories, bulkDeleteCategories, toggleCategoryStatus,
} from "../controllers/categoryController.js";
import { verifyToken, requirePermission, optionalAuth } from "../middlewares/auth.js";

const router = Router();

// Public
router.get("/", optionalAuth, listCategories);
router.get("/:id", optionalAuth, getCategoryById);

// Protected
router.post("/", verifyToken, requirePermission("add-categories"), createCategory);
router.put("/:id", verifyToken, requirePermission("edit-categories"), updateCategory);
router.patch("/:id/toggle-status", verifyToken, requirePermission("edit-categories"), toggleCategoryStatus);
router.delete("/bulk", verifyToken, requirePermission("delete-categories"), bulkDeleteCategories);
router.delete("/:id", verifyToken, requirePermission("delete-categories"), deleteCategory);

export default router;