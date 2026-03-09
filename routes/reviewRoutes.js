/**
 * reviewRoutes.js
 * Admin routes for review management.
 * Mount at: /api/reviews
 */
import express from "express";
import { verifyToken as authenticate, requirePermission as authorize } from "../middlewares/auth.js";
import mongoose from "mongoose";
import { sendSuccess, sendError } from "../utils/response.js";

const r = express.Router();
const { Schema, model, models } = mongoose;

const reviewSchema = new Schema({
  bookId:   { type: Schema.Types.ObjectId, ref: "Book", required: true },
  userId:   { type: Schema.Types.ObjectId, ref: "User", required: true },
  rating:   { type: Number, min: 1, max: 5, required: true },
  title:    String,
  body:     String,
  verified: { type: Boolean, default: false },
}, { timestamps: true });
const Review = models.Review || model("Review", reviewSchema);

// GET /api/reviews — all reviews (admin)
r.get("/", authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 15, rating, bookId } = req.query;
    const filter = {};
    if (rating) filter.rating = Number(rating);
    if (bookId) filter.bookId = bookId;
    const skip = (Number(page) - 1) * Number(limit);
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate("bookId", "title coverImage")
        .populate("userId", "name email picture")
        .sort({ createdAt: -1 })
        .skip(skip).limit(Number(limit)),
      Review.countDocuments(filter)
    ]);
    sendSuccess(res, 200, { reviews, total });
  } catch (e) { sendError(res, 500, e.message); }
});

// DELETE /api/reviews/:id — admin delete any review
r.delete("/:id", authenticate, async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    sendSuccess(res, 200, null, "Review deleted");
  } catch (e) { sendError(res, 500, e.message); }
});

export default r;