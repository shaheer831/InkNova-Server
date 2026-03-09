
/**
 * routes/materialRoutes.js
 */
import { Router } from "express";
import {
  createMaterial, getMaterialById, updateMaterial, deleteMaterial,
  listMaterials, bulkDeleteMaterials, lowStockMaterials,
} from "../controllers/materialController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.post("/", requirePermission("add-materials"), createMaterial);
router.get("/all", requirePermission("view-materials"), async (req, res) => {
  const { Material } = await import("../models/index.js");
  const { sendSuccess } = await import("../utils/response.js");
  const materials = await Material.find().select("_id name unit stock").sort({ name: 1 });
  return sendSuccess(res, 200, "All materials retrieved", materials);
});
router.get("/", requirePermission("view-materials"), listMaterials);
router.get("/low-stock", requirePermission("view-materials"), lowStockMaterials);
router.get("/:id", requirePermission("view-materials"), getMaterialById);
router.put("/:id", requirePermission("edit-materials"), updateMaterial);
router.delete("/bulk", requirePermission("delete-materials"), bulkDeleteMaterials);
router.delete("/:id", requirePermission("delete-materials"), deleteMaterial);

export default router;