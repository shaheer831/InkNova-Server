/**
 * controllers/inventoryController.js
 * Inventory management: CRUD, low stock report, stock adjustment.
 */
import { Inventory } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";

export const createInventory = asyncHandler(async (req, res) => {
  const { bookId, stock, warehouseLocation, lowStockThreshold } = req.body;
  if (!bookId) return sendError(res, 400, "bookId is required");

  const inventory = await Inventory.create({ bookId, stock, warehouseLocation, lowStockThreshold });
  await logActivity(req.user._id, "CREATE", "Inventory", inventory._id);
  return sendSuccess(res, 201, "Inventory created", inventory);
});

export const getInventoryById = asyncHandler(async (req, res) => {
  const inventory = await Inventory.findById(req.params.id).populate("bookId", "title slug price");
  if (!inventory) return sendError(res, 404, "Inventory not found");
  return sendSuccess(res, 200, "Inventory retrieved", inventory);
});

export const updateInventory = asyncHandler(async (req, res) => {
  const allowed = ["stock", "lowStockThreshold", "warehouseLocation"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const inventory = await Inventory.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!inventory) return sendError(res, 404, "Inventory not found");
  await logActivity(req.user._id, "UPDATE", "Inventory", inventory._id);
  return sendSuccess(res, 200, "Inventory updated", inventory);
});

export const deleteInventory = asyncHandler(async (req, res) => {
  const inventory = await Inventory.findByIdAndDelete(req.params.id);
  if (!inventory) return sendError(res, 404, "Inventory not found");
  await logActivity(req.user._id, "DELETE", "Inventory", req.params.id);
  return sendSuccess(res, 200, "Inventory deleted");
});

export const bulkDeleteInventory = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids required");
  const result = await Inventory.deleteMany({ _id: { $in: ids } });
  return sendSuccess(res, 200, `${result.deletedCount} inventory records deleted`);
});

export const listInventory = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);

  const { data, meta } = await paginateQuery(Inventory, {}, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "bookId", select: "title slug coverImage" }],
  });
  return sendSuccess(res, 200, "Inventory retrieved", data, meta);
});

/* ── Low stock report ─────────────────────────── */
export const lowStockReport = asyncHandler(async (req, res) => {
  const items = await Inventory.find({
    $expr: { $lte: ["$stock", "$lowStockThreshold"] },
  }).populate("bookId", "title slug price");

  return sendSuccess(res, 200, "Low stock items", items);
});

/* ── Adjust stock (add or subtract) ──────────── */
export const adjustStock = asyncHandler(async (req, res) => {
  const { adjustment } = req.body;
  if (adjustment === undefined) return sendError(res, 400, "adjustment value required");

  // For negative adjustments, ensure sufficient stock atomically
  const filter = adjustment < 0
    ? { _id: req.params.id, stock: { $gte: Math.abs(adjustment) } }
    : { _id: req.params.id };

  const inventory = await Inventory.findOneAndUpdate(
    filter,
    { $inc: { stock: adjustment } },
    { new: true }
  );

  if (!inventory) {
    const exists = await Inventory.findById(req.params.id);
    if (!exists) return sendError(res, 404, "Inventory not found");
    return sendError(res, 400, "Insufficient stock");
  }

  await logActivity(req.user._id, "ADJUST_STOCK", "Inventory", inventory._id, { adjustment });
  return sendSuccess(res, 200, "Stock adjusted", inventory);
});
