/**
 * routes/discountRoutes.js
 */
import { Router } from "express";
import {
  createDiscount, getDiscountById, updateDiscount, deleteDiscount,
  listDiscounts, bulkDeleteDiscounts, toggleDiscountStatus, validateDiscountCode,
  applyDiscount,
} from "../controllers/discountController.js";
import { verifyToken, requirePermission, optionalAuth } from "../middlewares/auth.js";

const router = Router();

// Public
router.get("/validate/:code", optionalAuth, validateDiscountCode);

router.use(verifyToken);

// POST /api/discounts/apply — validates code + increments usageCount
router.post("/apply", applyDiscount);

router.post("/", requirePermission("add-discounts"), createDiscount);
router.get("/all", requirePermission("view-discounts"), async (req, res) => {
  const { Discount } = await import("../models/index.js");
  const { sendSuccess } = await import("../utils/response.js");
  const discounts = await Discount.find({ isActive: true }).select("_id code type value expiryDate").sort({ code: 1 });
  return sendSuccess(res, 200, "All discounts retrieved", discounts);
});
router.get("/", requirePermission("view-discounts"), listDiscounts);
router.get("/:id", requirePermission("view-discounts"), getDiscountById);
router.put("/:id", requirePermission("edit-discounts"), updateDiscount);
router.patch("/:id/toggle-status", requirePermission("edit-discounts"), toggleDiscountStatus);
router.delete("/bulk", requirePermission("delete-discounts"), bulkDeleteDiscounts);
router.delete("/:id", requirePermission("delete-discounts"), deleteDiscount);

export default router;