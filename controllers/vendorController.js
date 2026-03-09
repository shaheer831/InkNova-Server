/**
 * controllers/vendorController.js
 * Vendor management: full CRUD + list with filters.
 */
import { Vendor, Material } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { keywordFilter, fieldFilter, mergeFilters } from "../utils/filters.js";

export const createVendor = asyncHandler(async (req, res) => {
  const { name, email, phone, address } = req.body;
  if (!name) return sendError(res, 400, "Name is required");

  const vendor = await Vendor.create({ name, email, phone, address });
  await logActivity(req.user._id, "CREATE", "Vendor", vendor._id);
  return sendSuccess(res, 201, "Vendor created", vendor);
});

export const getVendorById = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) return sendError(res, 404, "Vendor not found");
  return sendSuccess(res, 200, "Vendor retrieved", vendor);
});

export const updateVendor = asyncHandler(async (req, res) => {
  const allowed = ["name", "email", "phone", "address", "isActive"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const vendor = await Vendor.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!vendor) return sendError(res, 404, "Vendor not found");
  await logActivity(req.user._id, "UPDATE", "Vendor", vendor._id);
  return sendSuccess(res, 200, "Vendor updated", vendor);
});

export const deleteVendor = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findByIdAndDelete(req.params.id);
  if (!vendor) return sendError(res, 404, "Vendor not found");
  await Material.updateMany({ vendorId: req.params.id }, { $unset: { vendorId: "" } });
  await logActivity(req.user._id, "DELETE", "Vendor", req.params.id);
  return sendSuccess(res, 200, "Vendor deleted");
});

export const bulkDeleteVendors = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids required");
  const result = await Vendor.deleteMany({ _id: { $in: ids } });
  return sendSuccess(res, 200, `${result.deletedCount} vendors deleted`);
});

export const listVendors = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { search, isActive } = req.query;

  const searchFilter = keywordFilter(search, ["name", "email"]);
  const eqFilter = fieldFilter({ isActive }, ["isActive"]);
  const filter = mergeFilters(searchFilter, eqFilter);

  const { data, meta } = await paginateQuery(Vendor, filter, { page, limit, skip, sortBy, order });
  return sendSuccess(res, 200, "Vendors retrieved", data, meta);
});

export const toggleVendorStatus = asyncHandler(async (req, res) => {
  const vendor = await Vendor.findById(req.params.id);
  if (!vendor) return sendError(res, 404, "Vendor not found");
  vendor.isActive = !vendor.isActive;
  await vendor.save();
  return sendSuccess(res, 200, `Vendor ${vendor.isActive ? "activated" : "deactivated"}`);
});
