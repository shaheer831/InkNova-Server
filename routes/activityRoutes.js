
/**
 * routes/activityRoutes.js
 */
import { Router } from "express";
import { listActivityLogs, getActivityLogById } from "../controllers/activityController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.get("/", requirePermission("view-logs"), listActivityLogs);
router.get("/:id", requirePermission("view-logs"), getActivityLogById);

export default router;