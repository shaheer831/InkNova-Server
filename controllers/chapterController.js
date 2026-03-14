/**
 * controllers/chapterController.js
 * Admin: Chapter CRUD (text content management)
 * Text content is stored directly in DB — no file uploads.
 */
import { Book, Chapter, Subscription, Notification } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";

/* Count words in text */
const countWords = (text = "") => text.trim().split(/\s+/).filter(Boolean).length;

/* Estimated reading time: 200 words/min average */
const estimateMinutes = (wordCount) => Math.max(1, Math.ceil(wordCount / 200));

/* CREATE */
export const createChapter = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const { title, chapterNumber, content, isPublished, isFree, authorNote } = req.body;

  if (!title) return sendError(res, 400, "Chapter title is required");
  if (!content) return sendError(res, 400, "Chapter content is required");
  if (chapterNumber === undefined) return sendError(res, 400, "Chapter number is required");

  const book = await Book.findById(bookId);
  if (!book) return sendError(res, 404, "Book not found");

  const exists = await Chapter.findOne({ bookId, chapterNumber: Number(chapterNumber) });
  if (exists) return sendError(res, 409, `Chapter ${chapterNumber} already exists for this book`);

  const wordCount = countWords(content);
  const estimatedReadingMinutes = estimateMinutes(wordCount);

  const chapter = await Chapter.create({
    bookId,
    title,
    chapterNumber: Number(chapterNumber),
    content,
    wordCount,
    estimatedReadingMinutes,
    isPublished: isPublished === true || isPublished === "true",
    isFree: isFree !== false && isFree !== "false",
    authorNote: authorNote || "",
    publishedAt: (isPublished === true || isPublished === "true") ? new Date() : null,
  });

  // Update book aggregate stats
  const totalChapters = await Chapter.countDocuments({ bookId, isPublished: true });
  const aggResult = await Chapter.aggregate([
    { $match: { bookId: book._id, isPublished: true } },
    { $group: { _id: null, totalWords: { $sum: "$wordCount" }, totalMinutes: { $sum: "$estimatedReadingMinutes" } } }
  ]);
  const agg = aggResult[0] || { totalWords: 0, totalMinutes: 0 };
  await Book.findByIdAndUpdate(bookId, {
    chapterCount: totalChapters,
    wordCount: agg.totalWords,
    estimatedReadingMinutes: agg.totalMinutes,
  });

  // Notify series subscribers if book belongs to a series
  if (chapter.isPublished && book.seriesId) {
    const subs = await Subscription.find({ seriesId: book.seriesId, notifyNewChapter: true });
    if (subs.length) {
      const notifs = subs.map((s) => ({
        userId: s.userId,
        type: "new_chapter",
        title: `New chapter: ${chapter.title}`,
        body: `${book.title} has a new chapter — ${chapter.title}`,
        bookId: book._id,
        seriesId: book.seriesId,
        chapterId: chapter._id,
      }));
      await Notification.insertMany(notifs);
    }
  }

  await logActivity(req.user._id, "CREATE", "Chapter", chapter._id);
  return sendSuccess(res, 201, "Chapter created", chapter);
});

/* GET CHAPTER (content included for admin) */
export const getChapterById = asyncHandler(async (req, res) => {
  const { bookId, id } = req.params;
  const chapter = await Chapter.findOne({ _id: id, bookId });
  if (!chapter) return sendError(res, 404, "Chapter not found");
  return sendSuccess(res, 200, "Chapter retrieved", chapter);
});

/* LIST (no content body for performance) */
export const listChapters = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const book = await Book.findById(bookId);
  if (!book) return sendError(res, 404, "Book not found");

  const { page, limit, skip } = parsePagination(req.query);
  const { isPublished } = req.query;

  const filter = { bookId };
  if (isPublished !== undefined) filter.isPublished = isPublished === "true";

  const { data, meta } = await paginateQuery(Chapter, filter, {
    page, limit, skip, sortBy: "chapterNumber", order: "asc",
    select: "-content",  // exclude large content field in list
  });
  return sendSuccess(res, 200, "Chapters retrieved", data, meta);
});

/* UPDATE */
export const updateChapter = asyncHandler(async (req, res) => {
  const { bookId, id } = req.params;
  const chapter = await Chapter.findOne({ _id: id, bookId });
  if (!chapter) return sendError(res, 404, "Chapter not found");

  const { title, chapterNumber, content, isPublished, isFree, authorNote } = req.body;

  const wasPublished = chapter.isPublished;
  const updates = {
    ...(title && { title }),
    ...(chapterNumber !== undefined && { chapterNumber: Number(chapterNumber) }),
    ...(authorNote !== undefined && { authorNote }),
    ...(isFree !== undefined && { isFree: isFree !== false && isFree !== "false" }),
    ...(isPublished !== undefined && { isPublished: isPublished === true || isPublished === "true" }),
  };

  if (content) {
    const wc = countWords(content);
    updates.content = content;
    updates.wordCount = wc;
    updates.estimatedReadingMinutes = estimateMinutes(wc);
  }

  if (isPublished === true || isPublished === "true") {
    if (!wasPublished) updates.publishedAt = new Date();
  }

  const updated = await Chapter.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

  // Recalculate book stats
  const totalChapters = await Chapter.countDocuments({ bookId, isPublished: true });
  const aggResult = await Chapter.aggregate([
    { $match: { bookId: updated.bookId } },
    { $group: { _id: null, totalWords: { $sum: "$wordCount" }, totalMinutes: { $sum: "$estimatedReadingMinutes" } } }
  ]);
  const agg = aggResult[0] || { totalWords: 0, totalMinutes: 0 };
  await Book.findByIdAndUpdate(bookId, {
    chapterCount: totalChapters,
    wordCount: agg.totalWords,
    estimatedReadingMinutes: agg.totalMinutes,
  });

  await logActivity(req.user._id, "UPDATE", "Chapter", updated._id);
  return sendSuccess(res, 200, "Chapter updated", updated);
});

/* DELETE */
export const deleteChapter = asyncHandler(async (req, res) => {
  const { bookId, id } = req.params;
  const chapter = await Chapter.findOneAndDelete({ _id: id, bookId });
  if (!chapter) return sendError(res, 404, "Chapter not found");

  const totalChapters = await Chapter.countDocuments({ bookId, isPublished: true });
  const aggResult = await Chapter.aggregate([
    { $match: { bookId: chapter.bookId } },
    { $group: { _id: null, totalWords: { $sum: "$wordCount" }, totalMinutes: { $sum: "$estimatedReadingMinutes" } } }
  ]);
  const agg = aggResult[0] || { totalWords: 0, totalMinutes: 0 };
  await Book.findByIdAndUpdate(bookId, {
    chapterCount: totalChapters,
    wordCount: agg.totalWords,
    estimatedReadingMinutes: agg.totalMinutes,
  });

  await logActivity(req.user._id, "DELETE", "Chapter", id);
  return sendSuccess(res, 200, "Chapter deleted");
});

/* REORDER — update chapter numbers in bulk */
export const reorderChapters = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const { order } = req.body; // [{ id: "...", chapterNumber: 1 }, ...]
  if (!Array.isArray(order)) return sendError(res, 400, "order array required");

  await Promise.all(
    order.map(({ id, chapterNumber }) =>
      Chapter.findOneAndUpdate({ _id: id, bookId }, { chapterNumber: Number(chapterNumber) })
    )
  );

  await logActivity(req.user._id, "REORDER", "Chapter", bookId);
  return sendSuccess(res, 200, "Chapters reordered");
});

/* TOGGLE PUBLISH */
export const toggleChapterPublish = asyncHandler(async (req, res) => {
  const { bookId, id } = req.params;
  const chapter = await Chapter.findOne({ _id: id, bookId });
  if (!chapter) return sendError(res, 404, "Chapter not found");
  chapter.isPublished = !chapter.isPublished;
  if (chapter.isPublished && !chapter.publishedAt) chapter.publishedAt = new Date();
  await chapter.save();

  // Update book chapter count
  const totalChapters = await Chapter.countDocuments({ bookId, isPublished: true });
  await Book.findByIdAndUpdate(bookId, { chapterCount: totalChapters });

  return sendSuccess(res, 200, `Chapter ${chapter.isPublished ? "published" : "unpublished"}`, { isPublished: chapter.isPublished });
});
