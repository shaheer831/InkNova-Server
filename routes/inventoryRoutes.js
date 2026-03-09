
/**
 * routes/inventoryRoutes.js
 */
import { Router } from "express";
import {
  createInventory, getInventoryById, updateInventory, deleteInventory,
  listInventory, bulkDeleteInventory, lowStockReport, adjustStock,
} from "../controllers/inventoryController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.post("/", requirePermission("add-inventory"), createInventory);
router.get("/", requirePermission("view-inventory"), listInventory);
router.get("/low-stock", requirePermission("view-inventory"), lowStockReport);
router.get("/:id", requirePermission("view-inventory"), getInventoryById);
router.put("/:id", requirePermission("edit-inventory"), updateInventory);
router.patch("/:id/adjust", requirePermission("adjust-stock"), adjustStock);
router.delete("/bulk", requirePermission("delete-inventory"), bulkDeleteInventory);
router.delete("/:id", requirePermission("delete-inventory"), deleteInventory);

export default router;