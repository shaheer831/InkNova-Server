/**
 * routes/reviewRoutes.js
 * Admin review moderation routes
 */
import { Router } from "express";
import { Review, Book } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler } from "../utils/helpers.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";

const router = Router();

// List all reviews (admin)
router.get("/", verifyToken, requirePermission("view-reviews"), asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { status, bookId } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (bookId) filter.bookId = bookId;
  const { data, meta } = await paginateQuery(Review, filter, {
    page, limit, skip, sortBy, order,
    populate: [{ path: "userId", select: "name email picture" }, { path: "bookId", select: "title slug" }],
  });
  return sendSuccess(res, 200, "Reviews", data, meta);
}));

// Approve / reject review
router.patch("/:id/status", verifyToken, requirePermission("moderate-reviews"), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected", "pending"].includes(status)) return sendError(res, 400, "Invalid status");
  const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!review) return sendError(res, 404, "Review not found");
  // Recalculate book rating after moderation
  const agg = await Review.aggregate([
    { $match: { bookId: review.bookId, status: "approved" } },
    { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
  ]);
  await Book.findByIdAndUpdate(review.bookId, {
    averageRating: agg[0] ? Math.round(agg[0].avg * 10) / 10 : 0,
    reviewCount: agg[0] ? agg[0].count : 0,
  });
  return sendSuccess(res, 200, "Review status updated", review);
}));

// Delete review (admin)
router.delete("/:id", verifyToken, requirePermission("delete-reviews"), asyncHandler(async (req, res) => {
  const review = await Review.findByIdAndDelete(req.params.id);
  if (!review) return sendError(res, 404, "Review not found");
  return sendSuccess(res, 200, "Review deleted");
}));

export default router;
