/**
 * controllers/dashboardController.js
 * Admin dashboard aggregation endpoints.
 * COD only — revenue counted on delivered + codCollected orders.
 */
import { User, Book, Order, Inventory, Material, ActivityLog } from "../models/index.js";
import { sendSuccess } from "../utils/response.js";
import { asyncHandler } from "../utils/helpers.js";

/* ── Dashboard stats ──────────────────────────── */
export const getStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalBooks, totalOrders, pendingOrders] = await Promise.all([
    User.countDocuments(),
    Book.countDocuments({ status: "published" }),
    Order.countDocuments(),
    Order.countDocuments({ status: "pending" }),
  ]);

  const revenue = await Order.aggregate([
    { $match: { status: "delivered", codCollected: true } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  return sendSuccess(res, 200, "Dashboard stats", {
    totalUsers,
    totalBooks,
    totalOrders,
    pendingOrders,
    totalRevenue: revenue[0]?.total || 0,
  });
});

/* ── Sales overview (last 12 months) ─────────── */
export const getSalesOverview = asyncHandler(async (req, res) => {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const monthly = await Order.aggregate([
    {
      $match: {
        status: "delivered",
        codCollected: true,
        createdAt: { $gte: twelveMonthsAgo },
      },
    },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        revenue: { $sum: "$totalAmount" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  return sendSuccess(res, 200, "Sales overview", monthly);
});

/* ── Inventory alerts ─────────────────────────── */
export const getInventoryAlerts = asyncHandler(async (req, res) => {
  const [lowBooks, lowMaterials] = await Promise.all([
    Inventory.find({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } }).populate(
      "bookId",
      "title slug"
    ),
    Material.find({ $expr: { $lte: ["$stock", "$lowStockThreshold"] } }).populate(
      "vendorId",
      "name"
    ),
  ]);

  return sendSuccess(res, 200, "Inventory alerts", {
    lowStockBooks: lowBooks,
    lowStockMaterials: lowMaterials,
    totalAlerts: lowBooks.length + lowMaterials.length,
  });
});

/* ── Revenue summary ──────────────────────────── */
export const getRevenueSummary = asyncHandler(async (req, res) => {
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [total, today, thisMonth, pendingCollection] = await Promise.all([
    Order.aggregate([
      { $match: { status: "delivered", codCollected: true } },
      { $group: { _id: null, revenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { status: "delivered", codCollected: true, createdAt: { $gte: startOfToday } } },
      { $group: { _id: null, revenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { status: "delivered", codCollected: true, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, revenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { status: "delivered", codCollected: false } },
      { $group: { _id: null, revenue: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),
  ]);

  return sendSuccess(res, 200, "Revenue summary", {
    total: total[0] || { revenue: 0, count: 0 },
    today: today[0] || { revenue: 0, count: 0 },
    thisMonth: thisMonth[0] || { revenue: 0, count: 0 },
    pendingCodCollection: pendingCollection[0] || { revenue: 0, count: 0 },
  });
});

/* ── Recent activity logs ─────────────────────── */
export const getRecentActivity = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const logs = await ActivityLog.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("userId", "name email");   // removed 'role' — field no longer exists
  return sendSuccess(res, 200, "Recent activity", logs);
});