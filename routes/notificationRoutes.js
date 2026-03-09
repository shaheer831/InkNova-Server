/**
 * notificationRoutes.js
 * Admin routes for notification management.
 * Mount at: /api/notifications
 */
import express from "express";
import { verifyToken as authenticate, requirePermission as authorize } from "../middlewares/auth.js";
import mongoose from "mongoose";
import { sendSuccess, sendError } from "../utils/response.js";
import { User } from "../models/index.js";

const r = express.Router();
const { Schema, model, models } = mongoose;

// Notification model (shared with website controller)
const notifSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  type:   { type: String, enum: ["order", "promo", "system", "review"], default: "system" },
  title:  String,
  body:   String,
  read:   { type: Boolean, default: false },
  meta:   Schema.Types.Mixed,
}, { timestamps: true });
const Notification = models.Notification || model("Notification", notifSchema);

// GET /api/notifications/admin — list all recent notifications
r.get("/admin", authenticate, authorize("notifications:read"), async (req, res) => {
  try {
    const { page = 1, limit = 50, type, read } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (read !== undefined) filter.read = read === "true";
    const skip = (Number(page) - 1) * Number(limit);
    const [notifications, total] = await Promise.all([
      Notification.find(filter).populate("userId", "name email").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Notification.countDocuments(filter),
    ]);
    // sendSuccess(res, statusCode, message, data, meta)
    sendSuccess(res, 200, "Notifications retrieved", { notifications, total });
  } catch (e) { sendError(res, 500, e.message); }
});

// POST /api/notifications/broadcast — send to all or specific user
r.post("/broadcast", authenticate, authorize("notifications:create"), async (req, res) => {
  try {
    const { type = "system", title, body, targetAll = true, userId } = req.body;
    if (!title || !body) return sendError(res, 400, "Title and body required");

    let userIds = [];
    if (targetAll) {
      userIds = await User.find({ isActive: true }).distinct("_id");
    } else if (userId) {
      userIds = [userId];
    }

    const docs = userIds.map(uid => ({ userId: uid, type, title, body }));
    await Notification.insertMany(docs);

    sendSuccess(res, 201, `Notification sent to ${docs.length} users`, { sent: docs.length });
  } catch (e) { sendError(res, 500, e.message); }
});

// PATCH /api/notifications/:id/mark-read — mark a single notification as read
r.patch("/:id/mark-read", authenticate, authorize("notifications:read"), async (req, res) => {
  try {
    const notif = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );
    if (!notif) return sendError(res, 404, "Notification not found");
    sendSuccess(res, 200, "Notification marked as read", notif);
  } catch (e) { sendError(res, 500, e.message); }
});

// PATCH /api/notifications/mark-all-read — mark all as read
r.patch("/mark-all-read", authenticate, authorize("notifications:read"), async (req, res) => {
  try {
    const result = await Notification.updateMany({ read: false }, { read: true });
    sendSuccess(res, 200, `${result.modifiedCount} notifications marked as read`, { updated: result.modifiedCount });
  } catch (e) { sendError(res, 500, e.message); }
});

// DELETE /api/notifications/:id
r.delete("/:id", authenticate, authorize("notifications:delete"), async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    sendSuccess(res, 200, "Notification deleted", null);
  } catch (e) { sendError(res, 500, e.message); }
});

export default r;