
/**
 * routes/productionRoutes.js
 */
import { Router } from "express";
import {
  createBatch, getBatchById, updateBatch, deleteBatch,
  listBatches, bulkDeleteBatches, toggleBatchStatus,
} from "../controllers/productionController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.post("/", requirePermission("add-production"), createBatch);
router.get("/", requirePermission("view-production"), listBatches);
router.get("/:id", requirePermission("view-production"), getBatchById);
router.put("/:id", requirePermission("edit-production"), updateBatch);
router.patch("/:id/toggle-status", requirePermission("edit-production"), toggleBatchStatus);
router.delete("/bulk", requirePermission("delete-production"), bulkDeleteBatches);
router.delete("/:id", requirePermission("delete-production"), deleteBatch);

export default router;