
/**
 * routes/orderRoutes.js
 */
import { Router } from "express";
import {
  createOrder, getOrderById, updateOrderStatus, cancelOrder,
  deleteOrder, listOrders, bulkDeleteOrders, revenueOverview,
  markCodCollected,
} from "../controllers/orderController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.post("/", createOrder);
router.get("/", requirePermission("view-orders"), listOrders);
router.get("/revenue", requirePermission("view-reports"), revenueOverview);
router.get("/:id", getOrderById);
router.patch("/:id/status", requirePermission("edit-orders"), updateOrderStatus);
router.patch("/:id/cod-collected", requirePermission("edit-orders"), markCodCollected);
router.patch("/:id/cancel", cancelOrder);
router.delete("/bulk", requirePermission("delete-orders"), bulkDeleteOrders);
router.delete("/:id", requirePermission("delete-orders"), deleteOrder);

export default router;