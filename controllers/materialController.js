/**
 * controllers/materialController.js
 * Material management: CRUD + list + low stock report.
 */
import { Material } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { keywordFilter, fieldFilter, mergeFilters } from "../utils/filters.js";

export const createMaterial = asyncHandler(async (req, res) => {
  const { name, unit, stock, vendorId, lowStockThreshold } = req.body;
  if (!name) return sendError(res, 400, "Name is required");

  const material = await Material.create({ name, unit, stock, vendorId, lowStockThreshold });
  await logActivity(req.user._id, "CREATE", "Material", material._id);
  return sendSuccess(res, 201, "Material created", material);
});

export const getMaterialById = asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id).populate("vendorId", "name email");
  if (!material) return sendError(res, 404, "Material not found");
  return sendSuccess(res, 200, "Material retrieved", material);
});

export const updateMaterial = asyncHandler(async (req, res) => {
  const allowed = ["name", "unit", "stock", "lowStockThreshold", "vendorId"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const material = await Material.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!material) return sendError(res, 404, "Material not found");
  await logActivity(req.user._id, "UPDATE", "Material", material._id);
  return sendSuccess(res, 200, "Material updated", material);
});

export const deleteMaterial = asyncHandler(async (req, res) => {
  const material = await Material.findByIdAndDelete(req.params.id);
  if (!material) return sendError(res, 404, "Material not found");
  await logActivity(req.user._id, "DELETE", "Material", req.params.id);
  return sendSuccess(res, 200, "Material deleted");
});

export const bulkDeleteMaterials = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids required");
  const result = await Material.deleteMany({ _id: { $in: ids } });
  return sendSuccess(res, 200, `${result.deletedCount} materials deleted`);
});

export const listMaterials = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { search, vendorId } = req.query;

  const searchFilter = keywordFilter(search, ["name", "unit"]);
  const eqFilter = fieldFilter({ vendorId }, ["vendorId"]);
  const filter = mergeFilters(searchFilter, eqFilter);

  const { data, meta } = await paginateQuery(Material, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "vendorId", select: "name email" }],
  });
  return sendSuccess(res, 200, "Materials retrieved", data, meta);
});

export const lowStockMaterials = asyncHandler(async (req, res) => {
  const items = await Material.find({
    $expr: { $lte: ["$stock", "$lowStockThreshold"] },
  }).populate("vendorId", "name email phone");
  return sendSuccess(res, 200, "Low stock materials", items);
});
