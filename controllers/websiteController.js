/**
 * websiteController.js
 * Customer-facing storefront handlers for InkNest.
 *
 * Auth for customer endpoints uses a separate JWT flow (role: "customer").
 * All models are shared with the admin backend.
 */
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import {
  User, Book, Category, Order, Wishlist, Bookmark,
  Discount, ActivityLog,
} from "../models/index.js";
import { sendSuccess, sendError } from "../utils/websiteResponse.js";

// ── Models added for website only ────────────────────────────────────────────
const { Schema, model, models } = mongoose;

// Cart (session-persistent)
const cartItemSchema = new Schema({
  bookId: { type: Schema.Types.ObjectId, ref: "Book" },
  quantity: { type: Number, default: 1 },
  price: Number,
});
const cartSchema = new Schema({
  userId:       { type: Schema.Types.ObjectId, ref: "User", unique: true },
  items:        [cartItemSchema],
  discountCode: String,
  discountAmt:  { type: Number, default: 0 },
}, { timestamps: true });
const Cart = models.Cart || model("Cart", cartSchema);

// Review
const reviewSchema = new Schema({
  bookId:   { type: Schema.Types.ObjectId, ref: "Book", required: true },
  userId:   { type: Schema.Types.ObjectId, ref: "User", required: true },
  rating:   { type: Number, min: 1, max: 5, required: true },
  title:    String,
  body:     String,
  verified: { type: Boolean, default: false }, // verified purchase
}, { timestamps: true });
reviewSchema.index({ bookId: 1, userId: 1 }, { unique: true });
const Review = models.Review || model("Review", reviewSchema);

// Saved address book
const addressSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: "User" },
  label:     { type: String, default: "Home" },
  fullName:  String,
  phone:     String,
  line1:     String,
  line2:     String,
  city:      String,
  state:     String,
  postalCode:String,
  country:   { type: String, default: "Pakistan" },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });
const Address = models.Address || model("Address", addressSchema);

// Notification
const notifSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User" },
  type:   { type: String, enum: ["order", "promo", "system", "review"], default: "system" },
  title:  String,
  body:   String,
  read:   { type: Boolean, default: false },
  meta:   Schema.Types.Mixed,
}, { timestamps: true });
const Notification = models.Notification || model("Notification", notifSchema);

// ── JWT helpers ───────────────────────────────────────────────────────────────
const CUST_SECRET = process.env.JWT_SECRET || "inknest_secret";
const signAccess = (id) => jwt.sign({ id, audience: "customer" }, CUST_SECRET, { expiresIn: "15m" });
const signRefresh = (id) => jwt.sign({ id, audience: "customer" }, CUST_SECRET, { expiresIn: "7d" });

// Middleware helper (used inline in controller when called from routes that already ran authenticate)
const customerFromToken = async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, CUST_SECRET);
    if (payload.audience !== "customer") return null;
    return await User.findById(payload.id).select("-passwordHash -refreshToken");
  } catch { return null; }
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────
export const register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return sendError(res, 400, "Name, email and password required");
    if (await User.findOne({ email: email.toLowerCase() })) return sendError(res, 409, "Email already registered");

    // Find or create the customer role
    let customerRole = await Role.findOne({ name: /^customer$/i });
    if (!customerRole) {
      customerRole = await Role.create({ name: "customer", permissions: [] });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), passwordHash, roleId: customerRole._id, permissions: [], phone });

    const accessToken = signAccess(user._id);
    const refreshToken = signRefresh(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken });

    // send welcome notification
    await Notification.create({ userId: user._id, type: "system", title: "Welcome to InkNest!", body: `Hi ${name}, thanks for joining us. Start exploring our coloring books!` });

    sendSuccess(res, 201, { accessToken, refreshToken, user: { _id: user._id, name: user.name, email: user.email, roleId: user.roleId } });
  } catch (e) { sendError(res, 500, e.message); }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() }).populate("roleId");
    if (!user) return sendError(res, 401, "Invalid credentials");
    if (!user.isActive) return sendError(res, 403, "Account deactivated");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return sendError(res, 401, "Invalid credentials");
    const accessToken = signAccess(user._id);
    const refreshToken = signRefresh(user._id);
    await User.findByIdAndUpdate(user._id, { refreshToken, loginAttempts: 0 });
    sendSuccess(res, 200, {
      accessToken, refreshToken,
      user: { _id: user._id, name: user.name, email: user.email, picture: user.picture }
    });
  } catch (e) { sendError(res, 500, e.message); }
};

export const logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    sendSuccess(res, 200, null, "Logged out");
  } catch (e) { sendError(res, 500, e.message); }
};

export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return sendError(res, 400, "Refresh token required");
    const payload = jwt.verify(refreshToken, CUST_SECRET);
    const user = await User.findOne({ _id: payload.id, refreshToken });
    if (!user) return sendError(res, 401, "Invalid refresh token");
    const accessToken = signAccess(user._id);
    sendSuccess(res, 200, { accessToken });
  } catch { sendError(res, 401, "Token expired or invalid"); }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-passwordHash -refreshToken -loginAttempts -lockUntil");
    sendSuccess(res, 200, user);
  } catch (e) { sendError(res, 500, e.message); }
};

export const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, { name, phone }, { new: true }).select("-passwordHash -refreshToken");
    sendSuccess(res, 200, user);
  } catch (e) { sendError(res, 500, e.message); }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) return sendError(res, 400, "Current password incorrect");
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(user._id, { passwordHash });
    sendSuccess(res, 200, null, "Password changed");
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG
// ─────────────────────────────────────────────────────────────────────────────
export const listBooks = async (req, res) => {
  try {
    const {
      page = 1, limit = 20, sort = "createdAt", order = "desc",
      category, tags, minPrice, maxPrice, search, status = "published"
    } = req.query;

    const filter = { status };
    if (category) filter.categories = category;
    if (tags) filter.tags = { $in: tags.split(",") };
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (search) filter.$text = { $search: search };

    const skip = (Number(page) - 1) * Number(limit);
    const sortObj = { [sort]: order === "asc" ? 1 : -1 };
    const [books, total] = await Promise.all([
      Book.find(filter).populate("categories", "name slug").sort(sortObj).skip(skip).limit(Number(limit)).select("-pdfFile"),
      Book.countDocuments(filter)
    ]);

    sendSuccess(res, 200, {
      books,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (e) { sendError(res, 500, e.message); }
};

export const featuredBooks = async (req, res) => {
  try {
    const books = await Book.find({ status: "published" })
      .sort({ createdAt: -1 }).limit(8)
      .populate("categories", "name slug").select("-pdfFile");
    sendSuccess(res, 200, books);
  } catch (e) { sendError(res, 500, e.message); }
};

export const newArrivals = async (req, res) => {
  try {
    const books = await Book.find({ status: "published" })
      .sort({ createdAt: -1 }).limit(12)
      .populate("categories", "name slug").select("-pdfFile");
    sendSuccess(res, 200, books);
  } catch (e) { sendError(res, 500, e.message); }
};

export const popularBooks = async (req, res) => {
  try {
    // Rank by order count
    const popular = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.bookId", count: { $sum: "$items.quantity" } } },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ]);
    const ids = popular.map(p => p._id);
    const books = await Book.find({ _id: { $in: ids }, status: "published" })
      .populate("categories", "name slug").select("-pdfFile");
    // preserve order
    const ordered = ids.map(id => books.find(b => b._id.toString() === id.toString())).filter(Boolean);
    sendSuccess(res, 200, ordered);
  } catch (e) { sendError(res, 500, e.message); }
};

export const getBook = async (req, res) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug, status: "published" })
      .populate("categories", "name slug");
    if (!book) return sendError(res, 404, "Book not found");

    // Rating summary
    const ratingAgg = await Review.aggregate([
      { $match: { bookId: book._id } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);
    const ratings = ratingAgg[0] || { avg: 0, count: 0 };

    sendSuccess(res, 200, { ...book.toObject(), avgRating: ratings.avg, reviewCount: ratings.count });
  } catch (e) { sendError(res, 500, e.message); }
};

export const relatedBooks = async (req, res) => {
  try {
    const book = await Book.findOne({ slug: req.params.slug });
    if (!book) return sendError(res, 404, "Book not found");
    const books = await Book.find({
      _id: { $ne: book._id }, status: "published",
      $or: [{ categories: { $in: book.categories } }, { tags: { $in: book.tags } }]
    }).limit(6).select("-pdfFile");
    sendSuccess(res, 200, books);
  } catch (e) { sendError(res, 500, e.message); }
};

export const listCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    // attach book count per category
    const counts = await Book.aggregate([
      { $match: { status: "published" } },
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } }
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), c.count]));
    const result = categories.map(c => ({ ...c.toObject(), bookCount: countMap[c._id.toString()] || 0 }));
    sendSuccess(res, 200, result);
  } catch (e) { sendError(res, 500, e.message); }
};

export const categoryBooks = async (req, res) => {
  try {
    const cat = await Category.findOne({ slug: req.params.slug });
    if (!cat) return sendError(res, 404, "Category not found");
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [books, total] = await Promise.all([
      Book.find({ categories: cat._id, status: "published" }).skip(skip).limit(Number(limit)).select("-pdfFile"),
      Book.countDocuments({ categories: cat._id, status: "published" })
    ]);
    sendSuccess(res, 200, { category: cat, books, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (e) { sendError(res, 500, e.message); }
};

export const search = async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    if (!q) return sendError(res, 400, "Query is required");
    const regex = new RegExp(q, "i");
    const filter = {
      status: "published",
      $or: [{ title: regex }, { description: regex }, { tags: regex }]
    };
    const skip = (Number(page) - 1) * Number(limit);
    const [books, total] = await Promise.all([
      Book.find(filter).skip(skip).limit(Number(limit)).populate("categories", "name slug").select("-pdfFile"),
      Book.countDocuments(filter)
    ]);
    sendSuccess(res, 200, { books, query: q, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (e) { sendError(res, 500, e.message); }
};

export const validateDiscount = async (req, res) => {
  try {
    const { code, cartTotal } = req.body;
    if (!code) return sendError(res, 400, "Code required");
    const discount = await Discount.findOne({ code: code.toUpperCase(), isActive: true });
    if (!discount) return sendError(res, 404, "Invalid or expired discount code");
    if (discount.expiryDate && discount.expiryDate < new Date()) return sendError(res, 400, "Discount code has expired");
    if (discount.usageLimit && discount.usageCount >= discount.usageLimit) return sendError(res, 400, "Discount usage limit reached");
    const amount = discount.type === "percentage"
      ? Math.round((cartTotal * discount.value) / 100)
      : discount.value;
    sendSuccess(res, 200, { discount, discountAmount: amount });
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// CART
// ─────────────────────────────────────────────────────────────────────────────
const populateCart = (cart) => cart.populate({ path: "items.bookId", select: "title price coverImage slug status" });

export const getCart = async (req, res) => {
  try {
    let cart = await populateCart(Cart.findOne({ userId: req.user._id }));
    if (!cart) cart = await Cart.create({ userId: req.user._id, items: [] });
    sendSuccess(res, 200, cart);
  } catch (e) { sendError(res, 500, e.message); }
};

export const addToCart = async (req, res) => {
  try {
    const { bookId, quantity = 1 } = req.body;
    const book = await Book.findOne({ _id: bookId, status: "published" });
    if (!book) return sendError(res, 404, "Book not found");
    let cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) cart = new Cart({ userId: req.user._id, items: [] });
    const existing = cart.items.find(i => i.bookId.toString() === bookId);
    if (existing) existing.quantity += quantity;
    else cart.items.push({ bookId, quantity, price: book.price });
    await cart.save();
    await populateCart(Cart.findById(cart._id)).then(c => sendSuccess(res, 200, c));
  } catch (e) { sendError(res, 500, e.message); }
};

export const updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) return sendError(res, 404, "Cart not found");
    const item = cart.items.id(req.params.itemId);
    if (!item) return sendError(res, 404, "Item not found");
    if (quantity <= 0) cart.items.pull(req.params.itemId);
    else item.quantity = quantity;
    await cart.save();
    const updated = await populateCart(Cart.findById(cart._id));
    sendSuccess(res, 200, updated);
  } catch (e) { sendError(res, 500, e.message); }
};

export const removeCartItem = async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user._id });
    if (!cart) return sendError(res, 404, "Cart not found");
    cart.items.pull(req.params.itemId);
    await cart.save();
    const updated = await populateCart(Cart.findById(cart._id));
    sendSuccess(res, 200, updated);
  } catch (e) { sendError(res, 500, e.message); }
};

export const clearCart = async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ userId: req.user._id }, { items: [], discountCode: null, discountAmt: 0 });
    sendSuccess(res, 200, null, "Cart cleared");
  } catch (e) { sendError(res, 500, e.message); }
};

export const removeCartDiscount = async (req, res) => {
  try {
    const cart = await Cart.findOneAndUpdate(
      { userId: req.user._id },
      { discountCode: null, discountAmt: 0 },
      { new: true }
    ).populate({ path: "items.bookId", select: "title price coverImage slug status" });
    sendSuccess(res, 200, cart, "Discount removed");
  } catch (e) { sendError(res, 500, e.message); }
};

export const applyDiscountToCart = async (req, res) => {
  try {
    const { code } = req.body;
    const cart = await Cart.findOne({ userId: req.user._id }).populate("items.bookId", "price");
    if (!cart) return sendError(res, 404, "Cart not found");
    const discount = await Discount.findOne({ code: code?.toUpperCase(), isActive: true });
    if (!discount) return sendError(res, 404, "Invalid discount code");
    if (discount.expiryDate && discount.expiryDate < new Date()) return sendError(res, 400, "Discount expired");
    const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const discountAmt = discount.type === "percentage" ? Math.round(subtotal * discount.value / 100) : discount.value;
    cart.discountCode = discount.code;
    cart.discountAmt = discountAmt;
    await cart.save();
    sendSuccess(res, 200, { discountAmt, discountCode: discount.code, subtotal, total: subtotal - discountAmt });
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// WISHLIST
// ─────────────────────────────────────────────────────────────────────────────
export const getWishlist = async (req, res) => {
  try {
    const items = await Wishlist.find({ userId: req.user._id })
      .populate({ path: "bookId", select: "title price coverImage slug status" })
      .sort({ createdAt: -1 });
    sendSuccess(res, 200, items);
  } catch (e) { sendError(res, 500, e.message); }
};

export const addToWishlist = async (req, res) => {
  try {
    const { bookId } = req.params;
    const exists = await Wishlist.findOne({ userId: req.user._id, bookId });
    if (exists) return sendSuccess(res, 200, exists, "Already in wishlist");
    const item = await Wishlist.create({ userId: req.user._id, bookId });
    sendSuccess(res, 201, item);
  } catch (e) { sendError(res, 500, e.message); }
};

export const removeFromWishlist = async (req, res) => {
  try {
    await Wishlist.findOneAndDelete({ userId: req.user._id, bookId: req.params.bookId });
    sendSuccess(res, 200, null, "Removed from wishlist");
  } catch (e) { sendError(res, 500, e.message); }
};

export const moveWishlistToCart = async (req, res) => {
  try {
    const { bookIds } = req.body; // array of bookIds
    const targetIds = bookIds || (await Wishlist.find({ userId: req.user._id }).distinct("bookId"));
    let cart = await Cart.findOne({ userId: req.user._id }) || new Cart({ userId: req.user._id, items: [] });
    const books = await Book.find({ _id: { $in: targetIds }, status: "published" });
    for (const book of books) {
      const existing = cart.items.find(i => i.bookId.toString() === book._id.toString());
      if (existing) existing.quantity += 1;
      else cart.items.push({ bookId: book._id, quantity: 1, price: book.price });
    }
    await cart.save();
    if (!bookIds) await Wishlist.deleteMany({ userId: req.user._id });
    sendSuccess(res, 200, null, "Moved to cart");
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOKMARKS
// ─────────────────────────────────────────────────────────────────────────────
export const getBookmarks = async (req, res) => {
  try {
    const items = await Bookmark.find({ userId: req.user._id })
      .populate({ path: "bookId", select: "title price coverImage slug" })
      .sort({ createdAt: -1 });
    sendSuccess(res, 200, items);
  } catch (e) { sendError(res, 500, e.message); }
};

export const addBookmark = async (req, res) => {
  try {
    const exists = await Bookmark.findOne({ userId: req.user._id, bookId: req.params.bookId });
    if (exists) return sendSuccess(res, 200, exists, "Already bookmarked");
    const item = await Bookmark.create({ userId: req.user._id, bookId: req.params.bookId });
    sendSuccess(res, 201, item);
  } catch (e) { sendError(res, 500, e.message); }
};

export const removeBookmark = async (req, res) => {
  try {
    await Bookmark.findOneAndDelete({ userId: req.user._id, bookId: req.params.bookId });
    sendSuccess(res, 200, null, "Bookmark removed");
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────────────────────────────────────
export const myOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = { userId: req.user._id };
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter).populate("items.bookId", "title coverImage").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Order.countDocuments(filter)
    ]);
    sendSuccess(res, 200, { orders, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (e) { sendError(res, 500, e.message); }
};

export const placeOrder = async (req, res) => {
  try {
    const { shippingAddress, discountCode, notes, useCart, items: manualItems } = req.body;
    if (!shippingAddress) return sendError(res, 400, "Shipping address required");

    let orderItems = [];
    let discountAmount = 0;

    if (useCart) {
      const cart = await Cart.findOne({ userId: req.user._id }).populate("items.bookId");
      if (!cart || cart.items.length === 0) return sendError(res, 400, "Cart is empty");
      orderItems = cart.items.map(i => ({ bookId: i.bookId._id, quantity: i.quantity, price: i.price }));
      discountAmount = cart.discountAmt || 0;
    } else {
      // validate manual items
      const bookIds = manualItems.map(i => i.bookId);
      const books = await Book.find({ _id: { $in: bookIds }, status: "published" });
      orderItems = manualItems.map(i => {
        const book = books.find(b => b._id.toString() === i.bookId);
        if (!book) throw new Error(`Book ${i.bookId} not found`);
        return { bookId: book._id, quantity: i.quantity, price: book.price };
      });
    }

    // Apply discount if code given
    if (discountCode) {
      const disc = await Discount.findOne({ code: discountCode.toUpperCase(), isActive: true });
      if (disc && (!disc.expiryDate || disc.expiryDate > new Date())) {
        const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
        discountAmount = disc.type === "percentage" ? Math.round(subtotal * disc.value / 100) : disc.value;
        await Discount.findByIdAndUpdate(disc._id, { $inc: { usageCount: 1 } });
      }
    }

    const totalAmount = orderItems.reduce((s, i) => s + i.price * i.quantity, 0) - discountAmount;

    const order = await Order.create({
      userId: req.user._id,
      items: orderItems,
      totalAmount: Math.max(totalAmount, 0),
      discountCode,
      discountAmount,
      shippingAddress,
      notes,
      status: "pending",
      paymentMethod: "COD",
    });

    // Clear cart if used
    if (useCart) await Cart.findOneAndUpdate({ userId: req.user._id }, { items: [], discountCode: null, discountAmt: 0 });

    // Notify user
    await Notification.create({
      userId: req.user._id, type: "order",
      title: "Order Placed!", body: `Your order #${order._id} has been placed. We'll confirm it soon.`,
      meta: { orderId: order._id }
    });

    sendSuccess(res, 201, order);
  } catch (e) { sendError(res, 500, e.message); }
};

export const getOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id })
      .populate("items.bookId", "title coverImage price slug");
    if (!order) return sendError(res, 404, "Order not found");
    sendSuccess(res, 200, order);
  } catch (e) { sendError(res, 500, e.message); }
};

export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user._id });
    if (!order) return sendError(res, 404, "Order not found");
    if (!["pending", "confirmed"].includes(order.status)) return sendError(res, 400, "Order cannot be cancelled at this stage");
    order.status = "cancelled";
    await order.save();
    await Notification.create({
      userId: req.user._id, type: "order",
      title: "Order Cancelled", body: `Order #${order._id} has been cancelled.`,
      meta: { orderId: order._id }
    });
    sendSuccess(res, 200, order);
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────────────────────────
export const getReviews = async (req, res) => {
  try {
    const book = await Book.findById(req.params.bookId);
    if (!book) return sendError(res, 404, "Book not found");
    const { page = 1, limit = 10, rating } = req.query;
    const filter = { bookId: book._id };
    if (rating) filter.rating = Number(rating);
    const skip = (Number(page) - 1) * Number(limit);
    const [reviews, total, summary] = await Promise.all([
      Review.find(filter).populate("userId", "name picture").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Review.countDocuments(filter),
      Review.aggregate([
        { $match: { bookId: book._id } },
        { $group: { _id: "$rating", count: { $sum: 1 } } }
      ])
    ]);
    const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    summary.forEach(s => { ratingDist[s._id] = s.count; });
    sendSuccess(res, 200, { reviews, total, ratingDist, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (e) { sendError(res, 500, e.message); }
};

export const createReview = async (req, res) => {
  try {
    const { rating, title, body } = req.body;
    const book = await Book.findById(req.params.bookId);
    if (!book) return sendError(res, 404, "Book not found");
    // Check verified purchase
    const verified = await Order.exists({
      userId: req.user._id, "items.bookId": book._id,
      status: { $in: ["delivered", "completed"] }
    });
    const existing = await Review.findOne({ bookId: book._id, userId: req.user._id });
    if (existing) return sendError(res, 409, "You have already reviewed this book");
    const review = await Review.create({ bookId: book._id, userId: req.user._id, rating, title, body, verified: !!verified });
    sendSuccess(res, 201, review);
  } catch (e) { sendError(res, 500, e.message); }
};

export const updateReview = async (req, res) => {
  try {
    const review = await Review.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { rating: req.body.rating, title: req.body.title, body: req.body.body },
      { new: true }
    );
    if (!review) return sendError(res, 404, "Review not found");
    sendSuccess(res, 200, review);
  } catch (e) { sendError(res, 500, e.message); }
};

export const deleteReview = async (req, res) => {
  try {
    await Review.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    sendSuccess(res, 200, null, "Review deleted");
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADDRESSES
// ─────────────────────────────────────────────────────────────────────────────
export const getAddresses = async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.user._id }).sort({ isDefault: -1 });
    sendSuccess(res, 200, addresses);
  } catch (e) { sendError(res, 500, e.message); }
};

export const addAddress = async (req, res) => {
  try {
    const data = { ...req.body, userId: req.user._id };
    if (data.isDefault) await Address.updateMany({ userId: req.user._id }, { isDefault: false });
    const address = await Address.create(data);
    sendSuccess(res, 201, address);
  } catch (e) { sendError(res, 500, e.message); }
};

export const updateAddress = async (req, res) => {
  try {
    if (req.body.isDefault) await Address.updateMany({ userId: req.user._id }, { isDefault: false });
    const address = await Address.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, req.body, { new: true });
    if (!address) return sendError(res, 404, "Address not found");
    sendSuccess(res, 200, address);
  } catch (e) { sendError(res, 500, e.message); }
};

export const deleteAddress = async (req, res) => {
  try {
    await Address.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    sendSuccess(res, 200, null, "Address deleted");
  } catch (e) { sendError(res, 500, e.message); }
};

export const setDefaultAddress = async (req, res) => {
  try {
    await Address.updateMany({ userId: req.user._id }, { isDefault: false });
    const address = await Address.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { isDefault: true }, { new: true });
    sendSuccess(res, 200, address);
  } catch (e) { sendError(res, 500, e.message); }
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────
export const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unread } = req.query;
    const filter = { userId: req.user._id };
    if (unread === "true") filter.read = false;
    const skip = (Number(page) - 1) * Number(limit);
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      Notification.countDocuments(filter),
      Notification.countDocuments({ userId: req.user._id, read: false })
    ]);
    sendSuccess(res, 200, { notifications, unreadCount, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } });
  } catch (e) { sendError(res, 500, e.message); }
};

export const markNotificationRead = async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { read: true });
    sendSuccess(res, 200, null, "Marked as read");
  } catch (e) { sendError(res, 500, e.message); }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user._id }, { read: true });
    sendSuccess(res, 200, null, "All notifications marked as read");
  } catch (e) { sendError(res, 500, e.message); }
};
