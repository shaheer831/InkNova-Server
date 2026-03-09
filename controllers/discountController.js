/**
 * controllers/discountController.js
 * Discount/coupon management: CRUD, list, validate code.
 */
import { Discount } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, keywordFilter, mergeFilters } from "../utils/filters.js";

export const createDiscount = asyncHandler(async (req, res) => {
  const { code, type, value, expiryDate, usageLimit } = req.body;
  if (!code || !type || !value) return sendError(res, 400, "code, type, and value are required");

  const discount = await Discount.create({ code: code.toUpperCase(), type, value, expiryDate, usageLimit });
  await logActivity(req.user._id, "CREATE", "Discount", discount._id);
  return sendSuccess(res, 201, "Discount created", discount);
});

export const getDiscountById = asyncHandler(async (req, res) => {
  const discount = await Discount.findById(req.params.id);
  if (!discount) return sendError(res, 404, "Discount not found");
  return sendSuccess(res, 200, "Discount retrieved", discount);
});

export const updateDiscount = asyncHandler(async (req, res) => {
  const allowed = ["code", "type", "value", "expiryDate", "usageLimit", "isActive"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  if (updates.code) updates.code = updates.code.toUpperCase();

  const discount = await Discount.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!discount) return sendError(res, 404, "Discount not found");
  await logActivity(req.user._id, "UPDATE", "Discount", discount._id);
  return sendSuccess(res, 200, "Discount updated", discount);
});

export const deleteDiscount = asyncHandler(async (req, res) => {
  const discount = await Discount.findByIdAndDelete(req.params.id);
  if (!discount) return sendError(res, 404, "Discount not found");
  await logActivity(req.user._id, "DELETE", "Discount", req.params.id);
  return sendSuccess(res, 200, "Discount deleted");
});

export const bulkDeleteDiscounts = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids required");
  const result = await Discount.deleteMany({ _id: { $in: ids } });
  return sendSuccess(res, 200, `${result.deletedCount} discounts deleted`);
});

export const listDiscounts = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { isActive, type, search } = req.query;

  const eqFilter = fieldFilter({ isActive, type }, ["isActive", "type"]);
  const searchFilter = keywordFilter(search, ["code"]);
  const filter = mergeFilters(eqFilter, searchFilter);

  const { data, meta } = await paginateQuery(Discount, filter, { page, limit, skip, sortBy, order });
  return sendSuccess(res, 200, "Discounts retrieved", data, meta);
});

export const toggleDiscountStatus = asyncHandler(async (req, res) => {
  const discount = await Discount.findById(req.params.id);
  if (!discount) return sendError(res, 404, "Discount not found");
  discount.isActive = !discount.isActive;
  await discount.save();
  return sendSuccess(res, 200, `Discount ${discount.isActive ? "activated" : "deactivated"}`);
});

/* ── Validate a discount code (read-only, no increment) ─────────────────── */
export const validateDiscountCode = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const discount = await Discount.findOne({ code: code.toUpperCase(), isActive: true });

  if (!discount) return sendError(res, 404, "Invalid or expired discount code");
  if (discount.expiryDate && discount.expiryDate < new Date()) {
    return sendError(res, 400, "Discount code has expired");
  }
  if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
    return sendError(res, 400, "Discount usage limit reached");
  }

  return sendSuccess(res, 200, "Discount valid", discount);
});

/* ── Apply a discount code (validates + increments usageCount) ───────────
 * POST /api/discounts/apply
 * Body: { code: string, orderTotal?: number }
 * Returns: { code, type, value, discountAmount, finalTotal }
 * ─────────────────────────────────────────────────────────────────────── */
export const applyDiscount = asyncHandler(async (req, res) => {
  const { code, orderTotal } = req.body;
  if (!code) return sendError(res, 400, "Coupon code is required");

  const discount = await Discount.findOne({ code: code.toUpperCase().trim() });

  if (!discount) return sendError(res, 404, "Coupon code not found");
  if (!discount.isActive) return sendError(res, 400, "This coupon is currently inactive");
  if (discount.expiryDate && discount.expiryDate < new Date()) {
    return sendError(res, 400, "This coupon has expired");
  }
  if (discount.usageLimit != null && discount.usageCount >= discount.usageLimit) {
    return sendError(res, 400, "This coupon has reached its usage limit");
  }

  // Calculate discount amount
  const total = orderTotal ? Number(orderTotal) : 0;
  let discountAmount = 0;
  if (discount.type === "percentage") {
    discountAmount = total > 0 ? Math.round((total * discount.value) / 100) : discount.value;
  } else {
    discountAmount = total > 0 ? Math.min(discount.value, total) : discount.value;
  }

  // Atomic increment — guards against race conditions at the usage limit
  const updated = await Discount.findOneAndUpdate(
    {
      _id: discount._id,
      isActive: true,
      $or: [{ usageLimit: null }, { $expr: { $lt: ["$usageCount", "$usageLimit"] } }],
    },
    { $inc: { usageCount: 1 } },
    { new: true }
  );

  if (!updated) return sendError(res, 400, "Coupon is no longer available");

  await logActivity(req.user._id, "APPLY", "Discount", discount._id, { code: updated.code });

  return sendSuccess(res, 200, "Coupon applied successfully", {
    code: updated.code,
    type: updated.type,
    value: updated.value,
    discountAmount,
    finalTotal: total > 0 ? Math.max(total - discountAmount, 0) : null,
    usageCount: updated.usageCount,
    usageLimit: updated.usageLimit,
  });
});