/**
 * controllers/dashboardController.js
 * Admin dashboard analytics for reading platform
 */
import mongoose from "mongoose";
import {
  User, Book, Chapter, Series, Genre,
  ReadingProgress, Like, Favorite, Subscription,
  Review, ReadingHistory, ActivityLog,
} from "../models/index.js";
import { sendSuccess } from "../utils/response.js";
import { asyncHandler } from "../utils/helpers.js";

export const getDashboardStats = asyncHandler(async (req, res) => {
  const [
    totalUsers, activeUsers,
    totalBooks, publishedBooks, draftBooks,
    totalChapters, publishedChapters,
    totalSeries,
    totalGenres,
    totalReads, totalLikes, totalFavorites, totalSubscriptions,
    totalReviews,
    pendingReviews,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    Book.countDocuments(),
    Book.countDocuments({ status: "published" }),
    Book.countDocuments({ status: "draft" }),
    Chapter.countDocuments(),
    Chapter.countDocuments({ isPublished: true }),
    Series.countDocuments(),
    Genre.countDocuments({ isActive: true }),
    ReadingProgress.countDocuments(),
    Like.countDocuments(),
    Favorite.countDocuments(),
    Subscription.countDocuments(),
    Review.countDocuments(),
    Review.countDocuments({ status: "pending" }),
  ]);

  // Top books by engagement
  const topBooks = await Book.find({ status: "published" })
    .select("title slug coverImage likeCount favoriteCount viewCount averageRating completionCount")
    .sort({ viewCount: -1 })
    .limit(10);

  // Top series by subscribers
  const topSeries = await Series.find({ isPublished: true })
    .select("title slug coverImage subscriberCount totalVolumes status")
    .sort({ subscriberCount: -1 })
    .limit(5);

  // Recent users
  const recentUsers = await User.find()
    .select("name email picture createdAt")
    .sort({ createdAt: -1 })
    .limit(5);

  // New books (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const newBooksThisWeek = await Book.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
  const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

  // Reading activity last 7 days
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last7Days.push(d.toISOString().split("T")[0]);
  }

  const readingActivity = await ReadingHistory.aggregate([
    { $match: { date: { $in: last7Days } } },
    { $group: { _id: "$date", totalMinutes: { $sum: "$minutesRead" }, totalChapters: { $sum: "$chaptersRead" }, readers: { $addToSet: "$userId" } } },
    { $addFields: { readerCount: { $size: "$readers" } } },
    { $sort: { _id: 1 } },
  ]);

  // Genre distribution
  const genreDistribution = await Book.aggregate([
    { $match: { status: "published" } },
    { $unwind: "$genres" },
    { $group: { _id: "$genres", count: { $sum: 1 } } },
    { $lookup: { from: "genres", localField: "_id", foreignField: "_id", as: "genre" } },
    { $unwind: "$genre" },
    { $project: { name: "$genre.name", count: 1 } },
    { $sort: { count: -1 } },
    { $limit: 8 },
  ]);

  return sendSuccess(res, 200, "Dashboard stats", {
    overview: {
      totalUsers, activeUsers, newUsersThisWeek,
      totalBooks, publishedBooks, draftBooks, newBooksThisWeek,
      totalChapters, publishedChapters,
      totalSeries, totalGenres,
      totalReads, totalLikes, totalFavorites, totalSubscriptions,
      totalReviews, pendingReviews,
    },
    topBooks,
    topSeries,
    recentUsers,
    readingActivity,
    genreDistribution,
  });
});

export const getReadingAnalytics = asyncHandler(async (req, res) => {
  const { days = 30 } = req.query;
  const dayCount = Math.min(Number(days), 365);

  const dates = [];
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }

  const activity = await ReadingHistory.aggregate([
    { $match: { date: { $in: dates } } },
    { $group: { _id: "$date", totalMinutes: { $sum: "$minutesRead" }, totalChapters: { $sum: "$chaptersRead" }, uniqueReaders: { $addToSet: "$userId" } } },
    { $addFields: { uniqueReaderCount: { $size: "$uniqueReaders" } } },
    { $project: { uniqueReaders: 0 } },
    { $sort: { _id: 1 } },
  ]);

  // Books by completion rate
  const completionStats = await Book.find({ status: "published", viewCount: { $gt: 0 } })
    .select("title completionCount viewCount")
    .sort({ completionCount: -1 })
    .limit(10)
    .then((books) => books.map((b) => ({
      title: b.title,
      completionRate: ((b.completionCount / b.viewCount) * 100).toFixed(1),
      completionCount: b.completionCount,
      viewCount: b.viewCount,
    })));

  return sendSuccess(res, 200, "Reading analytics", { activity, completionStats });
});

export const getBookAnalytics = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const book = await Book.findById(id).populate("genres", "name");
  if (!book) return sendError(res, 404, "Book not found");

  const [readerCount, likeCount, favoriteCount, reviewCount, completedCount, chapterBreakdown] = await Promise.all([
    ReadingProgress.countDocuments({ bookId: id }),
    Like.countDocuments({ bookId: id }),
    Favorite.countDocuments({ bookId: id }),
    Review.countDocuments({ bookId: id }),
    ReadingProgress.countDocuments({ bookId: id, isCompleted: true }),
    Chapter.find({ bookId: id, isPublished: true })
      .select("chapterNumber title wordCount estimatedReadingMinutes")
      .sort({ chapterNumber: 1 }),
  ]);

  const ratingDistribution = await Review.aggregate([
    { $match: { bookId: book._id } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  return sendSuccess(res, 200, "Book analytics", {
    book: { title: book.title, genres: book.genres, averageRating: book.averageRating },
    engagement: { readerCount, likeCount, favoriteCount, reviewCount, completedCount },
    chapterBreakdown,
    ratingDistribution,
  });
});
