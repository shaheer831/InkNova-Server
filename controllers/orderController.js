/**
 * controllers/orderController.js
 * Order management — COD only.
 *
 * Changes from v1:
 *  - paymentMethod always "COD"
 *  - shippingAddress required on create
 *  - status flow: pending → confirmed → shipped → delivered | cancelled
 *  - markCodCollected endpoint to record cash collection
 *  - No Payment model dependency
 */
import { Order } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";

/* ── Create order (COD) ───────────────────────── */
export const createOrder = asyncHandler(async (req, res) => {
  const { items, currency, discountCode, discountAmount, shippingAddress, notes } = req.body;

  if (!items || !items.length) return sendError(res, 400, "items are required");

  if (!shippingAddress?.fullName || !shippingAddress?.phone ||
      !shippingAddress?.addressLine1 || !shippingAddress?.city) {
    return sendError(res, 400, "shippingAddress with fullName, phone, addressLine1, city is required");
  }

  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const order = await Order.create({
    userId: req.user._id,
    paymentMethod: "COD",
    items,
    totalAmount: totalAmount - (discountAmount || 0),
    currency: currency || "PKR",
    discountCode,
    discountAmount: discountAmount || 0,
    shippingAddress,
    notes,
  });

  await logActivity(req.user._id, "CREATE", "Order", order._id);
  return sendSuccess(res, 201, "Order placed (COD)", order);
});

/* ── Get order by ID ──────────────────────────── */
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate("userId", "name email")
    .populate("items.bookId", "title coverImage price");
  if (!order) return sendError(res, 404, "Order not found");
  return sendSuccess(res, 200, "Order retrieved", order);
});

/* ── Update order status ──────────────────────── */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const allowed = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
  if (!allowed.includes(status)) {
    return sendError(res, 400, `status must be one of: ${allowed.join(", ")}`);
  }

  const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!order) return sendError(res, 404, "Order not found");

  await logActivity(req.user._id, "UPDATE_STATUS", "Order", order._id, { status });
  return sendSuccess(res, 200, "Order status updated", order);
});

/* ── Mark COD as collected ────────────────────── */
export const markCodCollected = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return sendError(res, 404, "Order not found");
  if (order.status !== "delivered") {
    return sendError(res, 400, "Order must be in 'delivered' status before marking COD collected");
  }
  if (order.codCollected) {
    return sendError(res, 400, "COD already marked as collected for this order");
  }

  order.codCollected = true;
  order.codCollectedAt = new Date();
  await order.save();

  await logActivity(req.user._id, "COD_COLLECTED", "Order", order._id);
  return sendSuccess(res, 200, "COD marked as collected", {
    orderId: order._id,
    codCollected: true,
    codCollectedAt: order.codCollectedAt,
  });
});

/* ── Cancel order ─────────────────────────────── */
export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return sendError(res, 404, "Order not found");

  const nonCancellable = ["shipped", "delivered"];
  if (nonCancellable.includes(order.status)) {
    return sendError(res, 400, `Cannot cancel an order that is already ${order.status}`);
  }

  order.status = "cancelled";
  await order.save();

  await logActivity(req.user._id, "CANCEL", "Order", order._id);
  return sendSuccess(res, 200, "Order cancelled");
});

/* ── Delete order ─────────────────────────────── */
export const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) return sendError(res, 404, "Order not found");
  await logActivity(req.user._id, "DELETE", "Order", req.params.id);
  return sendSuccess(res, 200, "Order deleted");
});

/* ── Bulk delete ──────────────────────────────── */
export const bulkDeleteOrders = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return sendError(res, 400, "ids array required");
  const result = await Order.deleteMany({ _id: { $in: ids } });
  return sendSuccess(res, 200, `${result.deletedCount} orders deleted`);
});

/* ── List orders ──────────────────────────────── */
export const listOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { status, userId, codCollected, dateFrom, dateTo } = req.query;

  const eqFilter = fieldFilter({ status, userId }, ["status", "userId"]);
  if (codCollected !== undefined) eqFilter.codCollected = codCollected === "true";
  const dateFilter = dateRangeFilter(dateFrom, dateTo);

  const filter = mergeFilters(eqFilter, dateFilter ? { createdAt: dateFilter } : null);

  const { data, meta } = await paginateQuery(Order, filter, {
    page, limit, skip, sortBy, order,
    populate: [
      { path: "userId", select: "name email" },
      { path: "items.bookId", select: "title price" },
    ],
  });
  return sendSuccess(res, 200, "Orders retrieved", data, meta);
});

/* ── Revenue overview (COD delivered only) ────── */
export const revenueOverview = asyncHandler(async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  // Only count delivered + COD collected orders as actual revenue
  const matchFilter = { status: "delivered", codCollected: true };

  if (dateFrom || dateTo) {
    const dateFilter = dateRangeFilter(dateFrom, dateTo);
    if (dateFilter) matchFilter.createdAt = dateFilter;
  }

  const result = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$totalAmount" },
        totalOrders: { $sum: 1 },
        avgOrderValue: { $avg: "$totalAmount" },
      },
    },
  ]);

  const monthlyRevenue = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
        revenue: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);

  // COD pending collection (delivered but not yet collected)
  const pendingCollection = await Order.aggregate([
    { $match: { status: "delivered", codCollected: false } },
    { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
  ]);

  return sendSuccess(res, 200, "Revenue overview (COD)", {
    summary: result[0] || { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 },
    monthly: monthlyRevenue,
    pendingCodCollection: pendingCollection[0] || { total: 0, count: 0 },
  });
});
