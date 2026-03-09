/**
 * routes/websiteRoutes.js
 * Customer-facing storefront routes for InkNest.
 * Mounted at /api/website in server.js
 */
import { Router } from "express";
import * as w from "../controllers/websiteController.js";

const router = Router();

// ── Customer auth middleware (reuses same JWT secret, audience: "customer") ──
// websiteController.customerFromToken is an inline helper inside handlers,
// but protected routes still need token validation. We use a thin wrapper that
// calls the same JWT logic the controller uses.
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import { sendError } from "../utils/response.js";

const custAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return sendError(res, 401, "No token provided");
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "inknest_secret");
    if (payload.audience !== "customer") return sendError(res, 401, "Invalid token audience");
    const user = await User.findById(payload.id).select("-passwordHash -refreshToken");
    if (!user) return sendError(res, 401, "User not found");
    if (!user.isActive) return sendError(res, 403, "Account deactivated");
    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") return sendError(res, 401, "Token expired");
    return sendError(res, 401, "Invalid token");
  }
};

// ── AUTH ──────────────────────────────────────────────────────────────────────
router.post("/auth/register",       w.register);
router.post("/auth/login",          w.login);
router.post("/auth/logout",         custAuth, w.logout);
router.post("/auth/refresh",        w.refresh);
router.get ("/auth/me",             custAuth, w.me);
router.put ("/auth/me",             custAuth, w.updateProfile);
router.put ("/auth/me/password",    custAuth, w.changePassword);

// ── CATALOG ───────────────────────────────────────────────────────────────────
router.get ("/books",               w.listBooks);
router.get ("/books/featured",      w.featuredBooks);
router.get ("/books/new",           w.newArrivals);
router.get ("/books/popular",       w.popularBooks);
// Reviews nested under books
router.get ("/books/:bookId/reviews",           w.getReviews);
router.post("/books/:bookId/reviews",           custAuth, w.createReview);
router.put ("/books/:bookId/reviews/:id",       custAuth, w.updateReview);
router.delete("/books/:bookId/reviews/:id",     custAuth, w.deleteReview);
// Book by slug — must come AFTER specific /books/* routes
router.get ("/books/:slug",         w.getBook);
router.get ("/books/:slug/related", w.relatedBooks);

router.get ("/categories",               w.listCategories);
router.get ("/categories/:slug/books",   w.categoryBooks);

router.get ("/search",              w.search);

router.post("/discounts/validate",  w.validateDiscount);

// ── CART ──────────────────────────────────────────────────────────────────────
router.get   ("/cart",                  custAuth, w.getCart);
router.post  ("/cart/add",             custAuth, w.addToCart);
router.put   ("/cart/item/:itemId",    custAuth, w.updateCartItem);
router.delete("/cart/item/:itemId",    custAuth, w.removeCartItem);
router.delete("/cart",                 custAuth, w.clearCart);
router.post  ("/cart/apply-discount",  custAuth, w.applyDiscountToCart);
// Remove discount — clears discountCode and discountAmt on the cart
router.delete("/cart/discount",        custAuth, w.removeCartDiscount);

// ── WISHLIST ──────────────────────────────────────────────────────────────────
router.get   ("/wishlist",              custAuth, w.getWishlist);
router.post  ("/wishlist/move-to-cart", custAuth, w.moveWishlistToCart);
router.post  ("/wishlist/:bookId",      custAuth, w.addToWishlist);
router.delete("/wishlist/:bookId",      custAuth, w.removeFromWishlist);

// ── BOOKMARKS ─────────────────────────────────────────────────────────────────
router.get   ("/bookmarks",            custAuth, w.getBookmarks);
router.post  ("/bookmarks/:bookId",    custAuth, w.addBookmark);
router.delete("/bookmarks/:bookId",    custAuth, w.removeBookmark);

// ── ORDERS ────────────────────────────────────────────────────────────────────
router.get ("/orders",             custAuth, w.myOrders);
router.post("/orders",             custAuth, w.placeOrder);
router.get ("/orders/:id",         custAuth, w.getOrder);
router.post("/orders/:id/cancel",  custAuth, w.cancelOrder);

// ── ADDRESSES ─────────────────────────────────────────────────────────────────
router.get   ("/addresses",            custAuth, w.getAddresses);
router.post  ("/addresses",            custAuth, w.addAddress);
router.put   ("/addresses/:id",        custAuth, w.updateAddress);
router.delete("/addresses/:id",        custAuth, w.deleteAddress);
router.patch ("/addresses/:id/default",custAuth, w.setDefaultAddress);

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
router.get  ("/notifications",         custAuth, w.getNotifications);
router.patch("/notifications/:id/read",custAuth, w.markNotificationRead);
router.patch("/notifications/read-all",custAuth, w.markAllNotificationsRead);

export default router;
