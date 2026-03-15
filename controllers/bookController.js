/**
 * controllers/bookController.js
 * Admin: Book CRUD (text-based, no PDF)
 */
import { Book, Chapter, Genre, Series } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity, slugify } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, keywordFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";

/* Upload book images (cover, banner, showcase) to Cloudinary */
const uploadBookImages = async (files = {}) => {
  const result = {};
  if (files.coverImage?.[0]) {
    const f = files.coverImage[0];
    const { url, publicId } = await uploadToCloudinary(f.buffer, { folder: "inknova/covers", mimetype: f.mimetype });
    result.coverImage = { url, publicId, originalName: f.originalname };
  }
  if (files.bannerImage?.[0]) {
    const f = files.bannerImage[0];
    const { url, publicId } = await uploadToCloudinary(f.buffer, { folder: "inknova/banners", mimetype: f.mimetype });
    result.bannerImage = { url, publicId };
  }
  if (files.showcaseImages?.length) {
    result.showcaseImages = await Promise.all(
      files.showcaseImages.map(async (f) => {
        const { url, publicId } = await uploadToCloudinary(f.buffer, { folder: "inknova/showcase", mimetype: f.mimetype });
        return { url, publicId, originalName: f.originalname };
      })
    );
  }
  return result;
};

/* CREATE */
export const createBook = asyncHandler(async (req, res) => {
  const { title, description, synopsis, authorName, authorBio, genres, tags, language, ageRating, seriesId, volumeNumber, isFeatured, isFree, status } = req.body;
  if (!title) return sendError(res, 400, "Title is required");
  if (!authorName) return sendError(res, 400, "Author name is required");

  const fileData = await uploadBookImages(req.files || {});
  const slug = slugify(title) + "-" + Date.now();

  const book = await Book.create({
    title, slug, description, synopsis, authorName, authorBio,
    genres: genres ? (Array.isArray(genres) ? genres : [genres]) : [],
    tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim())) : [],
    language: language || "English",
    ageRating: ageRating || "all",
    seriesId: seriesId || null,
    volumeNumber: volumeNumber ? Number(volumeNumber) : null,
    isFeatured: isFeatured === "true" || isFeatured === true,
    isFree: isFree !== "false" && isFree !== false,
    status: status || "draft",
    createdBy: req.user._id,
    ...fileData,
  });

  if (seriesId) await Series.findByIdAndUpdate(seriesId, { $inc: { totalVolumes: 1 } });
  if (book.genres?.length) await Genre.updateMany({ _id: { $in: book.genres } }, { $inc: { bookCount: 1 } });

  await logActivity(req.user._id, "CREATE", "Book", book._id);
  return sendSuccess(res, 201, "Book created", book);
});

/* GET BY ID */
export const getBookById = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id)
    .populate("genres", "name slug icon color")
    .populate("seriesId", "title slug status");
  if (!book) return sendError(res, 404, "Book not found");
  return sendSuccess(res, 200, "Book retrieved", book);
});

/* UPDATE */
export const updateBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return sendError(res, 404, "Book not found");

  const fileData = await uploadBookImages(req.files || {});

  const { title, description, synopsis, authorName, authorBio, genres, tags, language, ageRating, seriesId, volumeNumber, isFeatured, isFree, status } = req.body;

  const updates = {
    ...(title && { title }),
    ...(description !== undefined && { description }),
    ...(synopsis !== undefined && { synopsis }),
    ...(authorName && { authorName }),
    ...(authorBio !== undefined && { authorBio }),
    ...(genres && { genres: Array.isArray(genres) ? genres : [genres] }),
    ...(tags && { tags: Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim()) }),
    ...(language && { language }),
    ...(ageRating && { ageRating }),
    ...(seriesId !== undefined && { seriesId: seriesId || null }),
    ...(volumeNumber !== undefined && { volumeNumber: volumeNumber ? Number(volumeNumber) : null }),
    ...(isFeatured !== undefined && { isFeatured: isFeatured === "true" || isFeatured === true }),
    ...(isFree !== undefined && { isFree: isFree !== "false" && isFree !== false }),
    ...(status && { status }),
    ...fileData,
  };

  if (status === "published" && book.status !== "published") updates.publishedAt = new Date();

  const updated = await Book.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate("genres", "name slug");

  await logActivity(req.user._id, "UPDATE", "Book", updated._id);
  return sendSuccess(res, 200, "Book updated", updated);
});

/* DELETE */
export const deleteBook = asyncHandler(async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) return sendError(res, 404, "Book not found");
  await Chapter.deleteMany({ bookId: req.params.id });
  if (book.seriesId) await Series.findByIdAndUpdate(book.seriesId, { $inc: { totalVolumes: -1 } });
  if (book.genres?.length) await Genre.updateMany({ _id: { $in: book.genres } }, { $inc: { bookCount: -1 } });
  await logActivity(req.user._id, "DELETE", "Book", req.params.id);
  return sendSuccess(res, 200, "Book deleted");
});

/* BULK DELETE */
export const bulkDeleteBooks = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids array required");
  await Chapter.deleteMany({ bookId: { $in: ids } });
  const result = await Book.deleteMany({ _id: { $in: ids } });
  await logActivity(req.user._id, "BULK_DELETE", "Book", ids.join(","));
  return sendSuccess(res, 200, `${result.deletedCount} books deleted`);
});

/* LIST */
export const listBooks = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { status, search, genre, seriesId, isFeatured, language, dateFrom, dateTo } = req.query;

  const eqFilter = fieldFilter({ status, language }, ["status", "language"]);
  const searchFilter = keywordFilter(search, ["title", "description", "authorName", "tags"]);
  const genreFilter = genre ? { genres: genre } : null;
  const seriesFilter = seriesId ? { seriesId } : null;
  const featuredFilter = isFeatured !== undefined ? { isFeatured: isFeatured === "true" } : null;
  const dateFilter = dateRangeFilter(dateFrom, dateTo);

  const filter = mergeFilters(
    eqFilter, searchFilter, genreFilter, seriesFilter,
    featuredFilter, dateFilter ? { createdAt: dateFilter } : null
  );

  const { data, meta } = await paginateQuery(Book, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "genres", select: "name slug" }, { path: "seriesId", select: "title slug" }],
  });
  return sendSuccess(res, 200, "Books retrieved", data, meta);
});

/* TOGGLE STATUS */
export const toggleBookStatus = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return sendError(res, 404, "Book not found");
  const cycle = { draft: "published", published: "archived", archived: "draft", coming_soon: "published" };
  book.status = cycle[book.status] || "draft";
  if (book.status === "published" && !book.publishedAt) book.publishedAt = new Date();
  await book.save();
  await logActivity(req.user._id, "STATUS_TOGGLE", "Book", book._id);
  return sendSuccess(res, 200, `Book status changed to ${book.status}`, { status: book.status });
});

/* TOGGLE FEATURED */
export const toggleFeatured = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return sendError(res, 404, "Book not found");
  book.isFeatured = !book.isFeatured;
  await book.save();
  return sendSuccess(res, 200, `Book ${book.isFeatured ? "featured" : "unfeatured"}`, { isFeatured: book.isFeatured });
});

/* SEARCH */
export const searchBooks = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return sendError(res, 400, "Query param q required");
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const filter = { ...keywordFilter(q, ["title", "description", "authorName", "tags"]), status: "published" };
  const { data, meta } = await paginateQuery(Book, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "genres", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Search results", data, meta);
});

/* ALL BOOKS (no pagination — for dropdowns) */
export const listBooksAll = asyncHandler(async (req, res) => {
  const { status, seriesId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (seriesId) filter.seriesId = seriesId;
  const books = await Book.find(filter)
    .select("_id title slug status authorName seriesId volumeNumber coverImage")
    .populate("seriesId", "title slug")
    .sort({ title: 1 });
  return sendSuccess(res, 200, "All books retrieved", books);
});
