
/**
 * routes/dashboardRoutes.js
 */
import { Router } from "express";
import {
  getStats, getSalesOverview, getInventoryAlerts,
  getRevenueSummary, getRecentActivity,
} from "../controllers/dashboardController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.get("/stats", requirePermission("view-dashboard"), getStats);
router.get("/sales", requirePermission("view-reports"), getSalesOverview);
router.get("/inventory-alerts", requirePermission("view-inventory"), getInventoryAlerts);
router.get("/revenue", requirePermission("view-reports"), getRevenueSummary);
router.get("/activity", requirePermission("view-logs"), getRecentActivity);

export default router;