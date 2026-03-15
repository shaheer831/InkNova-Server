/**
 * controllers/genreController.js
 * Admin: Genre CRUD
 */
import { Genre } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity, slugify } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { keywordFilter } from "../utils/filters.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

export const createGenre = asyncHandler(async (req, res) => {
  const { name, description, icon, color, parentId } = req.body;
  if (!name) return sendError(res, 400, "Name is required");

  let coverImage = {};
  if (req.file) {
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, { folder: "inknova/genres", mimetype: req.file.mimetype });
    coverImage = { url, publicId };
  }

  const slug = slugify(name) + "-" + Date.now();
  const genre = await Genre.create({ name, slug, description, icon, color, parentId: parentId || null, coverImage });
  await logActivity(req.user._id, "CREATE", "Genre", genre._id);
  return sendSuccess(res, 201, "Genre created", genre);
});

export const getGenreById = asyncHandler(async (req, res) => {
  const genre = await Genre.findById(req.params.id).populate("parentId", "name slug");
  if (!genre) return sendError(res, 404, "Genre not found");
  return sendSuccess(res, 200, "Genre retrieved", genre);
});

export const updateGenre = asyncHandler(async (req, res) => {
  const genre = await Genre.findById(req.params.id);
  if (!genre) return sendError(res, 404, "Genre not found");

  let coverImage = undefined;
  if (req.file) {
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, { folder: "inknova/genres", mimetype: req.file.mimetype });
    coverImage = { url, publicId };
  }

  const { name, description, icon, color, parentId, isActive } = req.body;
  const updates = {
    ...(name && { name }),
    ...(description !== undefined && { description }),
    ...(icon !== undefined && { icon }),
    ...(color !== undefined && { color }),
    ...(parentId !== undefined && { parentId: parentId || null }),
    ...(isActive !== undefined && { isActive: isActive === true || isActive === "true" }),
    ...(coverImage && { coverImage }),
  };

  const updated = await Genre.findByIdAndUpdate(req.params.id, updates, { new: true });
  await logActivity(req.user._id, "UPDATE", "Genre", updated._id);
  return sendSuccess(res, 200, "Genre updated", updated);
});

export const deleteGenre = asyncHandler(async (req, res) => {
  const genre = await Genre.findByIdAndDelete(req.params.id);
  if (!genre) return sendError(res, 404, "Genre not found");
  await logActivity(req.user._id, "DELETE", "Genre", req.params.id);
  return sendSuccess(res, 200, "Genre deleted");
});

export const listGenres = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { search, isActive, parentId } = req.query;

  const filter = {};
  if (search) Object.assign(filter, keywordFilter(search, ["name", "description"]) || {});
  if (isActive !== undefined) filter.isActive = isActive === "true";
  if (parentId !== undefined) filter.parentId = parentId === "null" ? null : parentId;

  const { data, meta } = await paginateQuery(Genre, filter, {
    page, limit, skip, sortBy: sortBy || "name", order,
    populate: [{ path: "parentId", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Genres retrieved", data, meta);
});

export const listGenresAll = asyncHandler(async (req, res) => {
  const genres = await Genre.find({ isActive: true })
    .select("_id name slug icon color bookCount")
    .sort({ name: 1 });
  return sendSuccess(res, 200, "All genres retrieved", genres);
});

export const toggleGenreActive = asyncHandler(async (req, res) => {
  const genre = await Genre.findById(req.params.id);
  if (!genre) return sendError(res, 404, "Genre not found");
  genre.isActive = !genre.isActive;
  await genre.save();
  await logActivity(req.user._id, "TOGGLE_ACTIVE", "Genre", genre._id);
  return sendSuccess(res, 200, `Genre ${genre.isActive ? "activated" : "deactivated"}`, { isActive: genre.isActive });
});

export const bulkDeleteGenres = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids array required");
  const result = await Genre.deleteMany({ _id: { $in: ids } });
  await logActivity(req.user._id, "BULK_DELETE", "Genre", ids.join(","));
  return sendSuccess(res, 200, `${result.deletedCount} genres deleted`);
});
