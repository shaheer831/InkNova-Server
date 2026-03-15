/**
 * controllers/seriesController.js
 * Admin: Series CRUD
 */
import { Series, Book } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity, slugify } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, keywordFilter, mergeFilters } from "../utils/filters.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const uploadSeriesImages = async (files = {}) => {
  const result = {};
  if (files.coverImage?.[0]) {
    const f = files.coverImage[0];
    const { url, publicId } = await uploadToCloudinary(f.buffer, { folder: "inknova/series/covers", mimetype: f.mimetype });
    result.coverImage = { url, publicId };
  }
  if (files.bannerImage?.[0]) {
    const f = files.bannerImage[0];
    const { url, publicId } = await uploadToCloudinary(f.buffer, { folder: "inknova/series/banners", mimetype: f.mimetype });
    result.bannerImage = { url, publicId };
  }
  return result;
};

export const createSeries = asyncHandler(async (req, res) => {
  const { title, description, authorName, genres, tags, status } = req.body;
  if (!title) return sendError(res, 400, "Title is required");
  if (!authorName) return sendError(res, 400, "Author name is required");

  const fileData = await uploadSeriesImages(req.files || {});
  const slug = slugify(title) + "-" + Date.now();

  const series = await Series.create({
    title, slug, description, authorName,
    genres: genres ? (Array.isArray(genres) ? genres : [genres]) : [],
    tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim())) : [],
    status: status || "ongoing",
    createdBy: req.user._id,
    ...fileData,
  });

  await logActivity(req.user._id, "CREATE", "Series", series._id);
  return sendSuccess(res, 201, "Series created", series);
});

export const getSeriesById = asyncHandler(async (req, res) => {
  const series = await Series.findById(req.params.id).populate("genres", "name slug icon");
  if (!series) return sendError(res, 404, "Series not found");
  const volumes = await Book.find({ seriesId: series._id, status: "published" })
    .select("title slug coverImage volumeNumber chapterCount estimatedReadingMinutes averageRating")
    .sort({ volumeNumber: 1 });
  return sendSuccess(res, 200, "Series retrieved", { series, volumes });
});

export const updateSeries = asyncHandler(async (req, res) => {
  const series = await Series.findById(req.params.id);
  if (!series) return sendError(res, 404, "Series not found");

  const fileData = await uploadSeriesImages(req.files || {});
  const { title, description, authorName, genres, tags, status, isPublished } = req.body;

  const updates = {
    ...(title && { title }),
    ...(description !== undefined && { description }),
    ...(authorName && { authorName }),
    ...(genres && { genres: Array.isArray(genres) ? genres : [genres] }),
    ...(tags && { tags: Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim()) }),
    ...(status && { status }),
    ...(isPublished !== undefined && { isPublished: isPublished === true || isPublished === "true" }),
    ...fileData,
  };

  const updated = await Series.findByIdAndUpdate(req.params.id, updates, { new: true });
  await logActivity(req.user._id, "UPDATE", "Series", updated._id);
  return sendSuccess(res, 200, "Series updated", updated);
});

export const deleteSeries = asyncHandler(async (req, res) => {
  const series = await Series.findByIdAndDelete(req.params.id);
  if (!series) return sendError(res, 404, "Series not found");
  await logActivity(req.user._id, "DELETE", "Series", req.params.id);
  return sendSuccess(res, 200, "Series deleted");
});

export const listSeries = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { status, search, genre } = req.query;

  const eqFilter = fieldFilter({ status }, ["status"]);
  const searchFilter = keywordFilter(search, ["title", "description", "authorName"]);
  const genreFilter = genre ? { genres: genre } : null;

  const filter = mergeFilters(eqFilter, searchFilter, genreFilter);
  const { data, meta } = await paginateQuery(Series, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "genres", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Series retrieved", data, meta);
});

export const listSeriesAll = asyncHandler(async (req, res) => {
  const series = await Series.find()
    .select("_id title slug status isPublished totalVolumes authorName")
    .sort({ title: 1 });
  return sendSuccess(res, 200, "All series retrieved", series);
});

export const bulkDeleteSeries = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids array required");
  const result = await Series.deleteMany({ _id: { $in: ids } });
  await logActivity(req.user._id, "BULK_DELETE", "Series", ids.join(","));
  return sendSuccess(res, 200, `${result.deletedCount} series deleted`);
});

export const toggleSeriesPublished = asyncHandler(async (req, res) => {
  const series = await Series.findById(req.params.id);
  if (!series) return sendError(res, 404, "Series not found");
  series.isPublished = !series.isPublished;
  await series.save();
  await logActivity(req.user._id, "TOGGLE_PUBLISHED", "Series", series._id);
  return sendSuccess(res, 200, `Series ${series.isPublished ? "published" : "unpublished"}`, { isPublished: series.isPublished });
});
