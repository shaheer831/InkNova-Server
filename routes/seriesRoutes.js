import { Router } from "express";
import {
  createSeries, getSeriesById, updateSeries, deleteSeries, listSeries,
  listSeriesAll, bulkDeleteSeries, toggleSeriesPublished,
} from "../controllers/seriesController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";
import { seriesImageUpload } from "../middlewares/upload.js";

const router = Router();

router.get("/all", listSeriesAll);
router.get("/", listSeries);
router.get("/:id", getSeriesById);

router.post("/", verifyToken, requirePermission("add-series"), seriesImageUpload, createSeries);
router.put("/:id", verifyToken, requirePermission("edit-series"), seriesImageUpload, updateSeries);
router.patch("/:id/toggle-published", verifyToken, requirePermission("edit-series"), toggleSeriesPublished);
router.delete("/bulk", verifyToken, requirePermission("delete-series"), bulkDeleteSeries);
router.delete("/:id", verifyToken, requirePermission("delete-series"), deleteSeries);

export default router;
