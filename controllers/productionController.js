/**
 * controllers/productionController.js
 * Production batch management: CRUD, status toggle, list with filters.
 */
import { ProductionBatch, Inventory } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";

export const createBatch = asyncHandler(async (req, res) => {
  const { bookId, quantity, status, startDate, endDate, notes } = req.body;
  if (!bookId || !quantity) return sendError(res, 400, "bookId and quantity are required");

  const batch = await ProductionBatch.create({ bookId, quantity, status, startDate, endDate, notes });
  await logActivity(req.user._id, "CREATE", "ProductionBatch", batch._id);
  return sendSuccess(res, 201, "Production batch created", batch);
});

export const getBatchById = asyncHandler(async (req, res) => {
  const batch = await ProductionBatch.findById(req.params.id).populate("bookId", "title slug");
  if (!batch) return sendError(res, 404, "Batch not found");
  return sendSuccess(res, 200, "Batch retrieved", batch);
});

export const updateBatch = asyncHandler(async (req, res) => {
  const allowed = ["quantity", "status", "startDate", "endDate", "notes"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const batch = await ProductionBatch.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!batch) return sendError(res, 404, "Batch not found");
  await logActivity(req.user._id, "UPDATE", "ProductionBatch", batch._id);
  return sendSuccess(res, 200, "Batch updated", batch);
});

export const deleteBatch = asyncHandler(async (req, res) => {
  const batch = await ProductionBatch.findByIdAndDelete(req.params.id);
  if (!batch) return sendError(res, 404, "Batch not found");
  await logActivity(req.user._id, "DELETE", "ProductionBatch", req.params.id);
  return sendSuccess(res, 200, "Batch deleted");
});

export const bulkDeleteBatches = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids required");
  const result = await ProductionBatch.deleteMany({ _id: { $in: ids } });
  return sendSuccess(res, 200, `${result.deletedCount} batches deleted`);
});

export const listBatches = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { status, dateFrom, dateTo } = req.query;

  const eqFilter = fieldFilter({ status }, ["status"]);
  const dateFilter = dateRangeFilter(dateFrom, dateTo);
  const filter = mergeFilters(eqFilter, dateFilter ? { startDate: dateFilter } : null);

  const { data, meta } = await paginateQuery(ProductionBatch, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "bookId", select: "title slug" }],
  });
  return sendSuccess(res, 200, "Batches retrieved", data, meta);
});

export const toggleBatchStatus = asyncHandler(async (req, res) => {
  const batch = await ProductionBatch.findById(req.params.id);
  if (!batch) return sendError(res, 404, "Batch not found");

  const prevStatus = batch.status;
  const cycle = { planned: "printing", printing: "completed", completed: "planned" };
  batch.status = cycle[batch.status] || "planned";
  await batch.save();

  // When a batch is completed, increment inventory for the associated book
  if (batch.status === "completed" && prevStatus !== "completed") {
    await Inventory.findOneAndUpdate(
      { bookId: batch.bookId },
      { $inc: { stock: batch.quantity } },
      { upsert: true, new: true }
    );
  }

  await logActivity(req.user._id, "STATUS_TOGGLE", "ProductionBatch", batch._id);
  return sendSuccess(res, 200, `Batch status changed to ${batch.status}`);
});
