
/**
 * routes/vendorRoutes.js
 */
import { Router } from "express";
import {
  createVendor, getVendorById, updateVendor, deleteVendor,
  listVendors, bulkDeleteVendors, toggleVendorStatus,
} from "../controllers/vendorController.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

router.use(verifyToken);

router.post("/", requirePermission("add-vendors"), createVendor);
router.get("/all", requirePermission("view-vendors"), async (req, res) => {
  const { Vendor } = await import("../models/index.js");
  const { sendSuccess } = await import("../utils/response.js");
  const vendors = await Vendor.find({ isActive: true }).select("_id name email phone").sort({ name: 1 });
  return sendSuccess(res, 200, "All vendors retrieved", vendors);
});
router.get("/", requirePermission("view-vendors"), listVendors);
router.get("/:id", requirePermission("view-vendors"), getVendorById);
router.put("/:id", requirePermission("edit-vendors"), updateVendor);
router.patch("/:id/toggle-status", requirePermission("edit-vendors"), toggleVendorStatus);
router.delete("/bulk", requirePermission("delete-vendors"), bulkDeleteVendors);
router.delete("/:id", requirePermission("delete-vendors"), deleteVendor);

export default router;