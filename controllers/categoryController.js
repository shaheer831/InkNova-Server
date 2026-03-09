/**
 * controllers/categoryController.js
 * CRUD + list + search for categories.
 */
import { Category, Book } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity, slugify } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { keywordFilter } from "../utils/filters.js";

export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, parentId } = req.body;
  if (!name) return sendError(res, 400, "Name is required");

  const slug = slugify(name) + "-" + Date.now();
  const category = await Category.create({ name, slug, description, parentId });

  await logActivity(req.user._id, "CREATE", "Category", category._id);
  return sendSuccess(res, 201, "Category created", category);
});

export const getCategoryById = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id).populate("parentId", "name slug");
  if (!category) return sendError(res, 404, "Category not found");
  return sendSuccess(res, 200, "Category retrieved", category);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const allowed = ["name", "description", "parentId", "isActive"];
  const updates = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

  const category = await Category.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!category) return sendError(res, 404, "Category not found");
  await logActivity(req.user._id, "UPDATE", "Category", category._id);
  return sendSuccess(res, 200, "Category updated", category);
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return sendError(res, 404, "Category not found");
  await Book.updateMany({}, { $pull: { categories: req.params.id } });
  await logActivity(req.user._id, "DELETE", "Category", req.params.id);
  return sendSuccess(res, 200, "Category deleted");
});

export const bulkDeleteCategories = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids array required");
  const result = await Category.deleteMany({ _id: { $in: ids } });
  await Book.updateMany({}, { $pull: { categories: { $in: ids } } });
  await logActivity(req.user._id, "BULK_DELETE", "Category", ids.join(","));
  return sendSuccess(res, 200, `${result.deletedCount} categories deleted`);
});

export const listCategories = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { search } = req.query;
  const filter = keywordFilter(search, ["name", "description"]) || {};

  const { data, meta } = await paginateQuery(Category, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "parentId", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Categories retrieved", data, meta);
});

export const toggleCategoryStatus = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return sendError(res, 404, "Category not found");
  category.isActive = !category.isActive;
  await category.save();
  return sendSuccess(res, 200, `Category ${category.isActive ? "activated" : "deactivated"}`);
});
