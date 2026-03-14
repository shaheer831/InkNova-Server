/**
 * routes/notificationRoutes.js
 * Admin notification management
 */
import { Router } from "express";
import { Notification, User, Subscription } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler } from "../utils/helpers.js";
import { verifyToken, requirePermission } from "../middlewares/auth.js";

const router = Router();

// Broadcast system notification to all active users
router.post("/broadcast", verifyToken, requirePermission("send-notifications"), asyncHandler(async (req, res) => {
  const { title, body, type = "system" } = req.body;
  if (!title) return sendError(res, 400, "title is required");
  const users = await User.find({ isActive: true }).select("_id");
  const notifs = users.map((u) => ({ userId: u._id, type, title, body }));
  await Notification.insertMany(notifs);
  return sendSuccess(res, 200, `Notification sent to ${users.length} users`);
}));

// Notify all subscribers of a series (new volume/update)
router.post("/series/:seriesId", verifyToken, requirePermission("send-notifications"), asyncHandler(async (req, res) => {
  const { title, body, type = "series_update", bookId, chapterId } = req.body;
  const subs = await Subscription.find({ seriesId: req.params.seriesId });
  if (!subs.length) return sendSuccess(res, 200, "No subscribers");
  const notifs = subs.map((s) => ({
    userId: s.userId,
    type, title, body,
    seriesId: req.params.seriesId,
    bookId: bookId || null,
    chapterId: chapterId || null,
  }));
  await Notification.insertMany(notifs);
  return sendSuccess(res, 200, `Notified ${subs.length} subscribers`);
}));

// Get all notifications (admin overview)
router.get("/", verifyToken, requirePermission("view-dashboard"), asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const notifs = await Notification.find()
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .populate("userId", "name email");
  return sendSuccess(res, 200, "Notifications", notifs);
}));

export default router;
