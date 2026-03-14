import { Router } from "express";
import { getDashboardStats, getReadingAnalytics, getBookAnalytics } from "../controllers/dashboardController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.get("/", verifyToken, requirePermission("view-dashboard"), getDashboardStats);
router.get("/reading-analytics", verifyToken, requirePermission("view-reports"), getReadingAnalytics);
router.get("/books/:id/analytics", verifyToken, requirePermission("view-reports"), getBookAnalytics);

export default router;
