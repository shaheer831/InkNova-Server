/**
 * controllers/readerController.js
 * Client-facing: all reader interactions
 * Auth via custAuth middleware (audience: "reader")
 */
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import {
  User, Book, Chapter, Series, Genre,
  ReadingProgress, Bookmark, Like, Favorite,
  Subscription, Review, Notification, ReadingHistory,
} from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { keywordFilter } from "../utils/filters.js";

const SECRET = process.env.JWT_SECRET || "inknova_secret";
const signAccess = (id) => jwt.sign({ id, audience: "reader" }, SECRET, { expiresIn: "15m" });
const signRefresh = (id) => jwt.sign({ id, audience: "reader" }, SECRET, { expiresIn: "7d" });

/* ── AUTH ──────────────────────────────────────────────────────── */

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return sendError(res, 400, "name, email, password required");
  if (password.length < 8) return sendError(res, 400, "Password must be at least 8 characters");
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return sendError(res, 409, "Email already registered");
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, passwordHash });
  const accessToken = signAccess(user._id);
  const refreshToken = signRefresh(user._id);
  user.refreshToken = refreshToken;
  await user.save();
  return sendSuccess(res, 201, "Account created", {
    accessToken, refreshToken,
    user: { _id: user._id, name: user.name, email: user.email, picture: user.picture },
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return sendError(res, 400, "email and password required");
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return sendError(res, 401, "Invalid credentials");
  if (user.isLocked) return sendError(res, 423, "Account temporarily locked");
  if (!user.isActive) return sendError(res, 403, "Account deactivated");
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
    if (user.loginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    return sendError(res, 401, "Invalid credentials");
  }
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  const accessToken = signAccess(user._id);
  const refreshToken = signRefresh(user._id);
  user.refreshToken = refreshToken;
  await user.save();
  return sendSuccess(res, 200, "Login successful", {
    accessToken, refreshToken,
    user: { _id: user._id, name: user.name, email: user.email, picture: user.picture, preferences: user.preferences, stats: user.stats },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return sendError(res, 400, "refreshToken required");
  try {
    const payload = jwt.verify(refreshToken, SECRET);
    if (payload.audience !== "reader") return sendError(res, 401, "Invalid token");
    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== refreshToken) return sendError(res, 401, "Invalid refresh token");
    const newAccess = signAccess(user._id);
    const newRefresh = signRefresh(user._id);
    user.refreshToken = newRefresh;
    await user.save();
    return sendSuccess(res, 200, "Token refreshed", { accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    return sendError(res, 401, "Invalid or expired refresh token");
  }
});

export const logout = asyncHandler(async (req, res) => {
  req.user.refreshToken = null;
  await req.user.save();
  return sendSuccess(res, 200, "Logged out");
});

export const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Profile", {
    _id: req.user._id, name: req.user.name, email: req.user.email,
    picture: req.user.picture, bio: req.user.bio,
    preferences: req.user.preferences, stats: req.user.stats,
    createdAt: req.user.createdAt,
  });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, bio, preferences } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (bio !== undefined) updates.bio = bio;
  if (preferences) updates.preferences = { ...req.user.preferences, ...preferences };
  const updated = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
    .select("-passwordHash -refreshToken");
  return sendSuccess(res, 200, "Profile updated", updated);
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return sendError(res, 400, "currentPassword and newPassword required");
  if (newPassword.length < 8) return sendError(res, 400, "New password must be at least 8 characters");
  const user = await User.findById(req.user._id);
  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return sendError(res, 401, "Current password incorrect");
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();
  return sendSuccess(res, 200, "Password changed");
});

/* ── CATALOG ───────────────────────────────────────────────────── */

export const listBooks = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { genre, seriesId, search, language, ageRating, isFree, sort } = req.query;

  const filter = { status: "published" };
  if (genre) filter.genres = genre;
  if (seriesId) filter.seriesId = seriesId;
  if (language) filter.language = language;
  if (ageRating) filter.ageRating = ageRating;
  if (isFree !== undefined) filter.isFree = isFree === "true";
  if (search) Object.assign(filter, keywordFilter(search, ["title", "description", "authorName", "tags"]) || {});

  // Sort presets
  const sortMap = {
    popular: { likeCount: -1 },
    rating: { averageRating: -1 },
    newest: { publishedAt: -1 },
    views: { viewCount: -1 },
    az: { title: 1 },
  };
  const sortOpt = sortMap[sort] || { publishedAt: -1 };

  const { data, meta } = await paginateQuery(Book, filter, {
    page, limit, skip,
    populate: [{ path: "genres", select: "name slug icon color" }, { path: "seriesId", select: "title slug" }],
    customSort: sortOpt,
  });
  return sendSuccess(res, 200, "Books", data, meta);
});

export const getBook = asyncHandler(async (req, res) => {
  const book = await Book.findOne({ slug: req.params.slug, status: "published" })
    .populate("genres", "name slug icon color")
    .populate("seriesId", "title slug status");
  if (!book) return sendError(res, 404, "Book not found");

  // Increment view count
  await Book.findByIdAndUpdate(book._id, { $inc: { viewCount: 1 } });

  // Attach reader-specific data if logged in
  let readerData = null;
  if (req.user) {
    const [progress, liked, favorited] = await Promise.all([
      ReadingProgress.findOne({ userId: req.user._id, bookId: book._id }).select("currentChapterNumber isCompleted scrollPosition lastReadAt"),
      Like.findOne({ userId: req.user._id, bookId: book._id }),
      Favorite.findOne({ userId: req.user._id, bookId: book._id }),
    ]);
    readerData = { progress, liked: !!liked, favorited: !!favorited };
  }

  // Chapter list (no content)
  const chapters = await Chapter.find({ bookId: book._id, isPublished: true })
    .select("chapterNumber title wordCount estimatedReadingMinutes isFree publishedAt")
    .sort({ chapterNumber: 1 });

  return sendSuccess(res, 200, "Book", { ...book.toObject(), chapters, readerData });
});

export const featuredBooks = asyncHandler(async (req, res) => {
  const books = await Book.find({ status: "published", isFeatured: true })
    .populate("genres", "name slug icon color")
    .sort({ publishedAt: -1 })
    .limit(10);
  return sendSuccess(res, 200, "Featured books", books);
});

export const newArrivals = asyncHandler(async (req, res) => {
  const books = await Book.find({ status: "published" })
    .populate("genres", "name slug")
    .sort({ publishedAt: -1 })
    .limit(12);
  return sendSuccess(res, 200, "New arrivals", books);
});

export const popularBooks = asyncHandler(async (req, res) => {
  const books = await Book.find({ status: "published" })
    .populate("genres", "name slug")
    .sort({ viewCount: -1, likeCount: -1 })
    .limit(12);
  return sendSuccess(res, 200, "Popular books", books);
});

export const topRatedBooks = asyncHandler(async (req, res) => {
  const books = await Book.find({ status: "published", reviewCount: { $gte: 1 } })
    .populate("genres", "name slug")
    .sort({ averageRating: -1, reviewCount: -1 })
    .limit(12);
  return sendSuccess(res, 200, "Top rated books", books);
});

export const relatedBooks = asyncHandler(async (req, res) => {
  const book = await Book.findOne({ slug: req.params.slug });
  if (!book) return sendError(res, 404, "Book not found");
  const related = await Book.find({
    status: "published",
    _id: { $ne: book._id },
    genres: { $in: book.genres },
  }).select("title slug coverImage authorName averageRating likeCount").limit(6);
  return sendSuccess(res, 200, "Related books", related);
});

export const listGenres = asyncHandler(async (req, res) => {
  const genres = await Genre.find({ isActive: true }).sort({ name: 1 });
  return sendSuccess(res, 200, "Genres", genres);
});

export const getGenre = asyncHandler(async (req, res) => {
  const genre = await Genre.findOne({ slug: req.params.slug, isActive: true });
  if (!genre) return sendError(res, 404, "Genre not found");
  const { page, limit, skip } = parsePagination(req.query);
  const { data, meta } = await paginateQuery(Book, { genres: genre._id, status: "published" }, {
    page, limit, skip, customSort: { publishedAt: -1 },
    populate: [{ path: "genres", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Genre books", { genre, books: data }, meta);
});

export const listSeries = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { genre, status, search } = req.query;
  const filter = { isPublished: true };
  if (genre) filter.genres = genre;
  if (status) filter.status = status;
  if (search) Object.assign(filter, keywordFilter(search, ["title", "description", "authorName"]) || {});
  const { data, meta } = await paginateQuery(Series, filter, {
    page, limit, skip, customSort: { subscriberCount: -1 },
    populate: [{ path: "genres", select: "name slug" }],
  });
  return sendSuccess(res, 200, "Series", data, meta);
});

export const getSeries = asyncHandler(async (req, res) => {
  const series = await Series.findOne({ slug: req.params.slug, isPublished: true })
    .populate("genres", "name slug icon");
  if (!series) return sendError(res, 404, "Series not found");
  const volumes = await Book.find({ seriesId: series._id, status: "published" })
    .select("title slug coverImage volumeNumber chapterCount estimatedReadingMinutes averageRating likeCount")
    .sort({ volumeNumber: 1 });

  let isSubscribed = false;
  if (req.user) {
    const sub = await Subscription.findOne({ userId: req.user._id, seriesId: series._id });
    isSubscribed = !!sub;
  }
  return sendSuccess(res, 200, "Series", { ...series.toObject(), volumes, isSubscribed });
});

export const search = asyncHandler(async (req, res) => {
  const { q, type = "all" } = req.query;
  if (!q) return sendError(res, 400, "q is required");
  const { page, limit, skip } = parsePagination(req.query);

  const results = {};
  const textFilter = keywordFilter(q, ["title", "description", "authorName"]) || {};

  if (type === "all" || type === "books") {
    results.books = await Book.find({ ...textFilter, status: "published" })
      .select("title slug coverImage authorName averageRating likeCount genres")
      .populate("genres", "name slug")
      .limit(10);
  }
  if (type === "all" || type === "series") {
    results.series = await Series.find({ ...keywordFilter(q, ["title", "description", "authorName"]) || {}, isPublished: true })
      .select("title slug coverImage authorName status subscriberCount")
      .limit(6);
  }
  if (type === "all" || type === "genres") {
    results.genres = await Genre.find({ name: { $regex: q, $options: "i" }, isActive: true }).limit(5);
  }

  return sendSuccess(res, 200, "Search results", results);
});

/* ── CHAPTER READING ─────────────────────────────────────────── */

export const getChapter = asyncHandler(async (req, res) => {
  const { bookSlug, chapterNumber } = req.params;
  const book = await Book.findOne({ slug: bookSlug, status: "published" });
  if (!book) return sendError(res, 404, "Book not found");

  const chapter = await Chapter.findOne({ bookId: book._id, chapterNumber: Number(chapterNumber), isPublished: true });
  if (!chapter) return sendError(res, 404, "Chapter not found");

  const [prevChapter, nextChapter] = await Promise.all([
    Chapter.findOne({ bookId: book._id, chapterNumber: Number(chapterNumber) - 1, isPublished: true })
      .select("chapterNumber title"),
    Chapter.findOne({ bookId: book._id, chapterNumber: Number(chapterNumber) + 1, isPublished: true })
      .select("chapterNumber title"),
  ]);

  let progress = null;
  if (req.user) {
    progress = await ReadingProgress.findOne({ userId: req.user._id, bookId: book._id });
  }

  return sendSuccess(res, 200, "Chapter", {
    book: { _id: book._id, title: book.title, slug: book.slug, coverImage: book.coverImage, chapterCount: book.chapterCount },
    chapter,
    navigation: { prev: prevChapter, next: nextChapter },
    progress,
  });
});

/* ── READING PROGRESS ──────────────────────────────────────────── */

export const updateProgress = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const { chapterId, chapterNumber, scrollPosition, characterPosition, minutesRead } = req.body;

  const book = await Book.findById(bookId);
  if (!book) return sendError(res, 404, "Book not found");

  const progressDoc = await ReadingProgress.findOneAndUpdate(
    { userId: req.user._id, bookId },
    {
      $set: {
        currentChapterId: chapterId,
        currentChapterNumber: Number(chapterNumber),
        scrollPosition: scrollPosition || 0,
        characterPosition: characterPosition || 0,
        lastReadAt: new Date(),
      },
      $addToSet: { completedChapterNumbers: Number(chapterNumber) },
      $inc: { totalReadingMinutes: minutesRead || 0, readingSessionCount: 1 },
    },
    { upsert: true, new: true }
  );

  // Check if book completed
  if (!progressDoc.isCompleted && progressDoc.completedChapterNumbers.length >= book.chapterCount) {
    progressDoc.isCompleted = true;
    progressDoc.completedAt = new Date();
    await progressDoc.save();
    await Book.findByIdAndUpdate(bookId, { $inc: { completionCount: 1 } });
    await User.findByIdAndUpdate(req.user._id, { $inc: { "stats.booksRead": 1 } });
  }

  // Update user stats
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { "stats.chaptersRead": 1, "stats.totalReadingMinutes": minutesRead || 0 },
    $set: { "stats.lastReadAt": new Date() },
  });

  // Log reading history for streak tracking
  const today = new Date().toISOString().split("T")[0];
  await ReadingHistory.findOneAndUpdate(
    { userId: req.user._id, date: today },
    { $inc: { minutesRead: minutesRead || 0, chaptersRead: 1 }, $addToSet: { booksOpened: bookId } },
    { upsert: true }
  );

  // Update streak
  await updateStreak(req.user._id);

  return sendSuccess(res, 200, "Progress saved", progressDoc);
});

const updateStreak = async (userId) => {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const user = await User.findById(userId).select("stats");
  const lastRead = user?.stats?.lastReadAt?.toISOString().split("T")[0];
  let newStreak = user?.stats?.currentStreak || 0;
  if (lastRead === yesterday) newStreak += 1;
  else if (lastRead !== today) newStreak = 1;
  const longestStreak = Math.max(newStreak, user?.stats?.longestStreak || 0);
  await User.findByIdAndUpdate(userId, { $set: { "stats.currentStreak": newStreak, "stats.longestStreak": longestStreak } });
};

export const getProgress = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const progress = await ReadingProgress.findOne({ userId: req.user._id, bookId })
    .populate("currentChapterId", "title chapterNumber");
  return sendSuccess(res, 200, "Progress", progress);
});

export const getLibrary = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const total = await ReadingProgress.countDocuments({ userId: req.user._id });
  const progresses = await ReadingProgress.find({ userId: req.user._id })
    .sort({ lastReadAt: -1 })
    .skip(skip).limit(limit)
    .populate({ path: "bookId", select: "title slug coverImage chapterCount authorName", populate: { path: "genres", select: "name slug" } })
    .populate("currentChapterId", "title chapterNumber");
  return sendSuccess(res, 200, "Library", progresses, { total, page, limit, pages: Math.ceil(total / limit) });
});

/* ── BOOKMARKS ─────────────────────────────────────────────────── */

export const getBookmarks = asyncHandler(async (req, res) => {
  const { bookId } = req.query;
  const filter = { userId: req.user._id };
  if (bookId) filter.bookId = bookId;
  const bookmarks = await Bookmark.find(filter)
    .populate("bookId", "title slug coverImage")
    .populate("chapterId", "title chapterNumber")
    .sort({ createdAt: -1 });
  return sendSuccess(res, 200, "Bookmarks", bookmarks);
});

export const addBookmark = asyncHandler(async (req, res) => {
  const { bookId, chapterId, chapterNumber, characterPosition, scrollPosition, note, label, color } = req.body;
  if (!bookId || !chapterId || chapterNumber === undefined) return sendError(res, 400, "bookId, chapterId, chapterNumber required");
  const bookmark = await Bookmark.create({
    userId: req.user._id, bookId, chapterId,
    chapterNumber: Number(chapterNumber),
    characterPosition: characterPosition || 0,
    scrollPosition: scrollPosition || 0,
    note, label, color,
  });
  return sendSuccess(res, 201, "Bookmark saved", bookmark);
});

export const updateBookmark = asyncHandler(async (req, res) => {
  const bookmark = await Bookmark.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: req.body },
    { new: true }
  );
  if (!bookmark) return sendError(res, 404, "Bookmark not found");
  return sendSuccess(res, 200, "Bookmark updated", bookmark);
});

export const deleteBookmark = asyncHandler(async (req, res) => {
  const bookmark = await Bookmark.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!bookmark) return sendError(res, 404, "Bookmark not found");
  return sendSuccess(res, 200, "Bookmark removed");
});

/* ── LIKES ──────────────────────────────────────────────────────── */

export const toggleLike = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const existing = await Like.findOne({ userId: req.user._id, bookId });
  if (existing) {
    await Like.findByIdAndDelete(existing._id);
    await Book.findByIdAndUpdate(bookId, { $inc: { likeCount: -1 } });
    return sendSuccess(res, 200, "Like removed", { liked: false });
  } else {
    await Like.create({ userId: req.user._id, bookId });
    await Book.findByIdAndUpdate(bookId, { $inc: { likeCount: 1 } });
    return sendSuccess(res, 200, "Liked", { liked: true });
  }
});

export const getLikedBooks = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const total = await Like.countDocuments({ userId: req.user._id });
  const likes = await Like.find({ userId: req.user._id })
    .sort({ createdAt: -1 }).skip(skip).limit(limit)
    .populate({ path: "bookId", select: "title slug coverImage authorName averageRating likeCount", populate: { path: "genres", select: "name slug" } });
  return sendSuccess(res, 200, "Liked books", likes.map((l) => l.bookId), { total, page, limit });
});

/* ── FAVORITES ──────────────────────────────────────────────────── */

export const toggleFavorite = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const existing = await Favorite.findOne({ userId: req.user._id, bookId });
  if (existing) {
    await Favorite.findByIdAndDelete(existing._id);
    await Book.findByIdAndUpdate(bookId, { $inc: { favoriteCount: -1 } });
    return sendSuccess(res, 200, "Removed from favorites", { favorited: false });
  } else {
    await Favorite.create({ userId: req.user._id, bookId });
    await Book.findByIdAndUpdate(bookId, { $inc: { favoriteCount: 1 } });
    return sendSuccess(res, 200, "Added to favorites", { favorited: true });
  }
});

export const getFavorites = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const total = await Favorite.countDocuments({ userId: req.user._id });
  const favs = await Favorite.find({ userId: req.user._id })
    .sort({ createdAt: -1 }).skip(skip).limit(limit)
    .populate({ path: "bookId", select: "title slug coverImage authorName averageRating chapterCount", populate: { path: "genres", select: "name slug" } });
  return sendSuccess(res, 200, "Favorites", favs.map((f) => f.bookId), { total, page, limit });
});

/* ── SUBSCRIPTIONS ──────────────────────────────────────────────── */

export const toggleSubscription = asyncHandler(async (req, res) => {
  const { seriesId } = req.params;
  const series = await Series.findById(seriesId);
  if (!series) return sendError(res, 404, "Series not found");
  const existing = await Subscription.findOne({ userId: req.user._id, seriesId });
  if (existing) {
    await Subscription.findByIdAndDelete(existing._id);
    await Series.findByIdAndUpdate(seriesId, { $inc: { subscriberCount: -1 } });
    return sendSuccess(res, 200, "Unsubscribed", { subscribed: false });
  } else {
    await Subscription.create({ userId: req.user._id, seriesId });
    await Series.findByIdAndUpdate(seriesId, { $inc: { subscriberCount: 1 } });
    return sendSuccess(res, 200, "Subscribed", { subscribed: true });
  }
});

export const updateSubscriptionPrefs = asyncHandler(async (req, res) => {
  const { seriesId } = req.params;
  const { notifyNewVolume, notifyNewChapter, notifyStatusChange } = req.body;
  const sub = await Subscription.findOneAndUpdate(
    { userId: req.user._id, seriesId },
    { $set: { notifyNewVolume, notifyNewChapter, notifyStatusChange } },
    { new: true }
  );
  if (!sub) return sendError(res, 404, "Subscription not found");
  return sendSuccess(res, 200, "Preferences updated", sub);
});

export const getSubscriptions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const total = await Subscription.countDocuments({ userId: req.user._id });
  const subs = await Subscription.find({ userId: req.user._id })
    .sort({ createdAt: -1 }).skip(skip).limit(limit)
    .populate({ path: "seriesId", select: "title slug coverImage status subscriberCount totalVolumes", populate: { path: "genres", select: "name slug" } });
  return sendSuccess(res, 200, "Subscriptions", subs, { total, page, limit });
});

/* ── REVIEWS ────────────────────────────────────────────────────── */

export const createReview = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const { rating, title, body, spoilerWarning } = req.body;
  if (!rating) return sendError(res, 400, "rating required");
  if (rating < 1 || rating > 5) return sendError(res, 400, "rating must be 1-5");

  const existing = await Review.findOne({ bookId, userId: req.user._id });
  if (existing) return sendError(res, 409, "You already reviewed this book");

  const review = await Review.create({
    bookId, userId: req.user._id,
    rating: Number(rating), title, body,
    spoilerWarning: spoilerWarning === true || spoilerWarning === "true",
  });

  // Recalculate average rating
  const agg = await Review.aggregate([
    { $match: { bookId: review.bookId, status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  if (agg[0]) {
    await Book.findByIdAndUpdate(bookId, {
      averageRating: Math.round(agg[0].avg * 10) / 10,
      reviewCount: agg[0].count,
    });
  }

  return sendSuccess(res, 201, "Review submitted", review);
});

export const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndUpdate(
    { _id: req.params.reviewId, userId: req.user._id },
    { $set: { rating: Number(req.body.rating), title: req.body.title, body: req.body.body, spoilerWarning: req.body.spoilerWarning } },
    { new: true, runValidators: true }
  );
  if (!review) return sendError(res, 404, "Review not found");

  const agg = await Review.aggregate([
    { $match: { bookId: review.bookId, status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  if (agg[0]) await Book.findByIdAndUpdate(review.bookId, { averageRating: Math.round(agg[0].avg * 10) / 10, reviewCount: agg[0].count });

  return sendSuccess(res, 200, "Review updated", review);
});

export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findOneAndDelete({ _id: req.params.reviewId, userId: req.user._id });
  if (!review) return sendError(res, 404, "Review not found");

  const agg = await Review.aggregate([
    { $match: { bookId: review.bookId, status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await Book.findByIdAndUpdate(review.bookId, {
    averageRating: agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0,
    reviewCount: agg[0] ? agg[0].count : 0,
  });

  return sendSuccess(res, 200, "Review deleted");
});

export const getReviews = asyncHandler(async (req, res) => {
  const { bookId } = req.params;
  const { page, limit, skip } = parsePagination(req.query);
  const { sort = "newest" } = req.query;
  const sortMap = { newest: { createdAt: -1 }, highest: { rating: -1 }, lowest: { rating: 1 }, helpful: { helpfulCount: -1 } };
  const total = await Review.countDocuments({ bookId, status: "approved" });
  const reviews = await Review.find({ bookId, status: "approved" })
    .sort(sortMap[sort] || sortMap.newest).skip(skip).limit(limit)
    .populate("userId", "name picture");
  const bookObjId = mongoose.Types.ObjectId.isValid(bookId) ? new mongoose.Types.ObjectId(bookId) : null;
  const ratingDist = bookObjId ? await Review.aggregate([
    { $match: { bookId: bookObjId } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
  ]) : [];
  return sendSuccess(res, 200, "Reviews", { reviews, ratingDistribution: ratingDist }, { total, page, limit });
});

export const markReviewHelpful = asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndUpdate(req.params.reviewId, { $inc: { helpfulCount: 1 } }, { new: true });
  if (!review) return sendError(res, 404, "Review not found");
  return sendSuccess(res, 200, "Marked helpful", { helpfulCount: review.helpfulCount });
});

/* ── NOTIFICATIONS ─────────────────────────────────────────────── */

export const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { isRead } = req.query;
  const filter = { userId: req.user._id };
  if (isRead !== undefined) filter.isRead = isRead === "true";
  const total = await Notification.countDocuments(filter);
  const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 }).skip(skip).limit(limit)
    .populate("bookId", "title slug coverImage")
    .populate("seriesId", "title slug");
  return sendSuccess(res, 200, "Notifications", notifications, { total, page, limit, unreadCount });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notif = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { isRead: true }, { new: true });
  if (!notif) return sendError(res, 404, "Notification not found");
  return sendSuccess(res, 200, "Marked as read");
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
  return sendSuccess(res, 200, "All notifications marked as read");
});

/* ── READER STATS ─────────────────────────────────────────────── */

export const getReadingStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [inProgress, completed, totalLiked, totalFavs, totalSubs] = await Promise.all([
    ReadingProgress.countDocuments({ userId, isCompleted: false }),
    ReadingProgress.countDocuments({ userId, isCompleted: true }),
    Like.countDocuments({ userId }),
    Favorite.countDocuments({ userId }),
    Subscription.countDocuments({ userId }),
  ]);

  // Reading history last 7 days
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    last7.push(d.toISOString().split("T")[0]);
  }
  const history = await ReadingHistory.find({ userId, date: { $in: last7 } })
    .select("date minutesRead chaptersRead").sort({ date: 1 });

  return sendSuccess(res, 200, "Reading stats", {
    overview: {
      ...req.user.stats?.toObject?.() || req.user.stats,
      booksInProgress: inProgress,
      booksCompleted: completed,
      totalLiked, totalFavs, totalSubs,
    },
    weeklyHistory: history,
  });
});

/* ── UPDATE AVATAR ──────────────────────────────────────────────── */
export const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 400, "No image file provided");

  const { useCloudinary } = await import("../middlewares/upload.js");
  let picture;

  if (useCloudinary) {
    const { uploadToCloudinary } = await import("../utils/cloudinary.js");
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, {
      folder: "inknova/avatars",
      mimetype: req.file.mimetype,
    });
    picture = { url, publicId, originalName: req.file.originalname };
  } else {
    picture = {
      url: `/uploads/avatars/${req.file.filename}`,
      originalName: req.file.originalname,
    };
  }

  const updated = await User.findByIdAndUpdate(
    req.user._id,
    { picture },
    { new: true }
  ).select("-passwordHash -refreshToken");

  return sendSuccess(res, 200, "Avatar updated", { picture: updated.picture });
});

/* ── DELETE ACCOUNT ─────────────────────────────────────────────── */
export const deleteAccount = asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) return sendError(res, 400, "Password required to delete account");

  const user = await User.findById(req.user._id);
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return sendError(res, 401, "Incorrect password");

  await user.deleteOne();
  return sendSuccess(res, 200, "Account deleted");
});
