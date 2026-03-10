/**
 * controllers/bookController.js
 * Book management: CRUD, status toggle, file uploads.
 *
 * Files accepted via multipart/form-data:
 *   pdfFile        – 1 PDF  (required on create)
 *   coverImage     – 1 image (required on create)
 *   showcaseImages – 3 to 5 images
 *
 * In production: buffers are uploaded to Cloudinary via uploadToCloudinary().
 * In development: local disk paths are used directly via parseUploadedFiles().
 */
import { Book } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity, slugify } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, keywordFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";
import { parseUploadedFiles } from "../middlewares/upload.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Upload all book files from req.files to Cloudinary (production only).
 * Returns a fileData object in the same shape as parseUploadedFiles().
 */
const uploadBookFilesToCloud = async (files = {}) => {
  const result = {};

  if (files.pdfFile?.[0]) {
    const f = files.pdfFile[0];
    const { url, publicId } = await uploadToCloudinary(f.buffer, {
      folder: "inknova/books/pdf",
      mimetype: f.mimetype,
    });
    result.pdfFile = { url, publicId, originalName: f.originalname, size: f.size };
  }

  if (files.coverImage?.[0]) {
    const f = files.coverImage[0];
    const { url, publicId } = await uploadToCloudinary(f.buffer, {
      folder: "inknova/books/covers",
      mimetype: f.mimetype,
    });
    result.coverImage = { url, publicId, originalName: f.originalname };
  }

  if (files.showcaseImages?.length) {
    result.showcaseImages = await Promise.all(
      files.showcaseImages.map(async (f) => {
        const { url, publicId } = await uploadToCloudinary(f.buffer, {
          folder: "inknova/books/showcase",
          mimetype: f.mimetype,
        });
        return { url, publicId, originalName: f.originalname };
      })
    );
  }

  return result;
};

/* ── Create book ──────────────────────────────── */
export const createBook = asyncHandler(async (req, res) => {
  const { title, description, price, status, categories, tags, pagesCount } = req.body;
  if (!title) return sendError(res, 400, "Title is required");

  const fileData = isProduction
    ? await uploadBookFilesToCloud(req.files || {})
    : parseUploadedFiles(req.files || {});

  // Validate showcase count when provided
  if (fileData.showcaseImages?.length > 0 && fileData.showcaseImages.length < 3) {
    return sendError(res, 400, "Upload at least 3 showcase images (max 5)");
  }

  const slug = slugify(title) + "-" + Date.now();

  const book = await Book.create({
    title,
    slug,
    description,
    price: price ? Number(price) : 0,
    pagesCount: pagesCount ? Number(pagesCount) : 0,
    status: status || "draft",
    categories: categories ? (Array.isArray(categories) ? categories : [categories]) : [],
    tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim())) : [],
    ...fileData,
  });

  await logActivity(req.user._id, "CREATE", "Book", book._id);
  return sendSuccess(res, 201, "Book created", book);
});

/* ── Get book by ID ───────────────────────────── */
export const getBookById = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id).populate("categories", "name slug");
  if (!book) return sendError(res, 404, "Book not found");
  return sendSuccess(res, 200, "Book retrieved", book);
});

/* ── Update book ──────────────────────────────── */
export const updateBook = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return sendError(res, 404, "Book not found");

  const fileData = isProduction
    ? await uploadBookFilesToCloud(req.files || {})
    : parseUploadedFiles(req.files || {});

  if (fileData.showcaseImages?.length > 0 && fileData.showcaseImages.length < 3) {
    return sendError(res, 400, "Upload at least 3 showcase images (max 5)");
  }

  const { title, description, price, status, categories, tags, pagesCount } = req.body;

  const updates = {
    ...(title && { title }),
    ...(description !== undefined && { description }),
    ...(price !== undefined && { price: Number(price) }),
    ...(pagesCount !== undefined && { pagesCount: Number(pagesCount) }),
    ...(status && { status }),
    ...(categories && { categories: Array.isArray(categories) ? categories : [categories] }),
    ...(tags && { tags: Array.isArray(tags) ? tags : tags.split(",").map((t) => t.trim()) }),
    ...fileData,
  };

  const updated = await Book.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  await logActivity(req.user._id, "UPDATE", "Book", updated._id);
  return sendSuccess(res, 200, "Book updated", updated);
});

/* ── Delete book ──────────────────────────────── */
export const deleteBook = asyncHandler(async (req, res) => {
  const book = await Book.findByIdAndDelete(req.params.id);
  if (!book) return sendError(res, 404, "Book not found");
  await logActivity(req.user._id, "DELETE", "Book", req.params.id);
  return sendSuccess(res, 200, "Book deleted");
});

/* ── Bulk delete ──────────────────────────────── */
export const bulkDeleteBooks = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids array required");
  const result = await Book.deleteMany({ _id: { $in: ids } });
  await logActivity(req.user._id, "BULK_DELETE", "Book", ids.join(","));
  return sendSuccess(res, 200, `${result.deletedCount} books deleted`);
});

/* ── List books ───────────────────────────────── */
export const listBooks = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { status, search, tag, dateFrom, dateTo } = req.query;

  const eqFilter = fieldFilter({ status }, ["status"]);
  const searchFilter = keywordFilter(search, ["title", "description", "tags"]);
  const tagFilter = tag ? { tags: tag } : null;
  const dateFilter = dateRangeFilter(dateFrom, dateTo);

  const filter = mergeFilters(eqFilter, searchFilter, tagFilter, dateFilter ? { createdAt: dateFilter } : null);

  const { data, meta } = await paginateQuery(Book, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "categories", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Books retrieved", data, meta);
});

/* ── Toggle status ────────────────────────────── */
export const toggleBookStatus = asyncHandler(async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return sendError(res, 404, "Book not found");

  const cycle = { draft: "published", published: "archived", archived: "draft" };
  book.status = cycle[book.status] || "draft";
  await book.save();

  await logActivity(req.user._id, "STATUS_TOGGLE", "Book", book._id);
  return sendSuccess(res, 200, `Book status changed to ${book.status}`, { status: book.status });
});

/* ── Search books ─────────────────────────────── */
export const searchBooks = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return sendError(res, 400, "Query param q required");

  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const filter = keywordFilter(q, ["title", "description", "tags"]) || {};

  const { data, meta } = await paginateQuery(Book, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "categories", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Search results", data, meta);
});
