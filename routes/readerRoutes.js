/**
 * routes/readerRoutes.js
 * Client-facing reading platform routes — mounted at /api/reader
 */
import { Router } from "express";
import * as r from "../controllers/readerController.js";
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { sendError } from "../utils/response.js";
import { avatarUpload } from "../middlewares/upload.js";

const router = Router();

/* ── Reader auth middleware ──────────────────────────────────── */
const custAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return sendError(res, 401, "No token provided");
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || "inknova_secret");
    if (payload.audience !== "reader") return sendError(res, 401, "Invalid token audience");
    const user = await User.findById(payload.id).select("-passwordHash -refreshToken").populate("roleId");
    if (!user) return sendError(res, 401, "User not found");
    if (!user.isActive) return sendError(res, 403, "Account deactivated");
    req.user = user;
    next();
  } catch (err) {
    return sendError(res, 401, err.name === "TokenExpiredError" ? "Token expired" : "Invalid token");
  }
};

/* Optional auth — attaches user if token present, continues either way */
const optAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next();
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET || "inknova_secret");
    if (payload.audience !== "reader") return next();
    const user = await User.findById(payload.id).select("-passwordHash -refreshToken");
    if (user?.isActive) req.user = user;
  } catch (_) {}
  next();
};

/* ── AUTH ─────────────────────────────────────────────────────── */
router.post("/auth/register",           r.register);
router.post("/auth/login",              r.login);
router.post("/auth/refresh",            r.refresh);
router.post("/auth/logout",             custAuth, r.logout);
router.get ("/auth/me",                 custAuth, r.me);
router.put ("/auth/me",                 custAuth, r.updateProfile);
router.put ("/auth/me/password",        custAuth, r.changePassword);
router.put ("/auth/me/avatar",          custAuth, avatarUpload, r.updateAvatar);
router.delete("/auth/me",               custAuth, r.deleteAccount);

/* ── CATALOG ──────────────────────────────────────────────────── */
router.get ("/books",               optAuth, r.listBooks);
router.get ("/books/featured",      r.featuredBooks);
router.get ("/books/new",           r.newArrivals);
router.get ("/books/popular",       r.popularBooks);
router.get ("/books/top-rated",     r.topRatedBooks);
router.get ("/books/:slug/related", r.relatedBooks);
router.get ("/books/:slug",         optAuth, r.getBook);

router.get ("/genres",              r.listGenres);
router.get ("/genres/:slug",        r.getGenre);

router.get ("/series",              optAuth, r.listSeries);
router.get ("/series/:slug",        optAuth, r.getSeries);

router.get ("/search",              r.search);

/* ── READING ─────────────────────────────────────────────────── */
router.get ("/books/:bookSlug/chapters/:chapterNumber", optAuth, r.getChapter);

/* ── PROGRESS ─────────────────────────────────────────────────── */
router.get ("/progress/:bookId",    custAuth, r.getProgress);
router.post("/progress/:bookId",    custAuth, r.updateProgress);
router.get ("/library",             custAuth, r.getLibrary);

/* ── BOOKMARKS ─────────────────────────────────────────────────── */
router.get   ("/bookmarks",         custAuth, r.getBookmarks);
router.post  ("/bookmarks",         custAuth, r.addBookmark);
router.put   ("/bookmarks/:id",     custAuth, r.updateBookmark);
router.delete("/bookmarks/:id",     custAuth, r.deleteBookmark);

/* ── LIKES ───────────────────────────────────────────────────── */
router.post("/books/:bookId/like",  custAuth, r.toggleLike);
router.get ("/likes",               custAuth, r.getLikedBooks);

/* ── FAVORITES ────────────────────────────────────────────────── */
router.post("/books/:bookId/favorite", custAuth, r.toggleFavorite);
router.get ("/favorites",              custAuth, r.getFavorites);

/* ── SUBSCRIPTIONS ────────────────────────────────────────────── */
router.post("/series/:seriesId/subscribe",       custAuth, r.toggleSubscription);
router.put ("/series/:seriesId/subscribe/prefs", custAuth, r.updateSubscriptionPrefs);
router.get ("/subscriptions",                    custAuth, r.getSubscriptions);

/* ── REVIEWS ──────────────────────────────────────────────────── */
router.get   ("/books/:bookId/reviews",              r.getReviews);
router.post  ("/books/:bookId/reviews",              custAuth, r.createReview);
router.put   ("/books/:bookId/reviews/:reviewId",    custAuth, r.updateReview);
router.delete("/books/:bookId/reviews/:reviewId",    custAuth, r.deleteReview);
router.post  ("/reviews/:reviewId/helpful",          custAuth, r.markReviewHelpful);

/* ── NOTIFICATIONS ────────────────────────────────────────────── */
router.get  ("/notifications",          custAuth, r.getNotifications);
router.patch("/notifications/:id/read", custAuth, r.markNotificationRead);
router.patch("/notifications/read-all", custAuth, r.markAllRead);

/* ── READER STATS ─────────────────────────────────────────────── */
router.get("/stats", custAuth, r.getReadingStats);

export default router;
