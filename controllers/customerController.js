/**
 * controllers/customerController.js
 * Customer (reader/end-user) management — admin-facing.
 * Lists users that have the "customer" role.
 */
import { User, Role, ReadingProgress, Like, Favorite, Subscription, Review } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler, logActivity } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { keywordFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";

/* Helper: resolve customer role id (cached in module scope for perf) */
let _customerRoleId = null;
const getCustomerRoleId = async () => {
  if (_customerRoleId) return _customerRoleId;
  const r = await Role.findOne({ name: /^customer$/i }).select("_id");
  if (r) _customerRoleId = r._id;
  return _customerRoleId;
};

/* LIST customers */
export const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { isActive, search, dateFrom, dateTo } = req.query;

  const customerRoleId = await getCustomerRoleId();
  // Find users with customer role OR no role (registered readers)
  const roleFilter = customerRoleId
    ? { $or: [{ roleId: customerRoleId }, { roleId: null }] }
    : { roleId: null };

  const searchFilter = keywordFilter(search, ["name", "email"]);
  const dateFilter = dateRangeFilter(dateFrom, dateTo);
  const activeFilter = isActive !== undefined ? { isActive: isActive === "true" } : null;

  const filter = mergeFilters(roleFilter, searchFilter, activeFilter, dateFilter ? { createdAt: dateFilter } : null);

  const { data, meta } = await paginateQuery(User, filter, {
    page, limit, skip,
    sortBy: sortBy || "createdAt",
    order,
    select: "-passwordHash -refreshToken",
    populate: [{ path: "roleId", select: "name" }],
  });

  return sendSuccess(res, 200, "Customers retrieved", data, meta);
});

/* GET customer by ID */
export const getCustomerById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select("-passwordHash -refreshToken")
    .populate("roleId", "name");
  if (!user) return sendError(res, 404, "Customer not found");

  const [booksInProgress, booksCompleted, totalLikes, totalFavs, totalSubs, totalReviews] = await Promise.all([
    ReadingProgress.countDocuments({ userId: user._id, isCompleted: false }),
    ReadingProgress.countDocuments({ userId: user._id, isCompleted: true }),
    Like.countDocuments({ userId: user._id }),
    Favorite.countDocuments({ userId: user._id }),
    Subscription.countDocuments({ userId: user._id }),
    Review.countDocuments({ userId: user._id }),
  ]);

  return sendSuccess(res, 200, "Customer retrieved", {
    ...user.toObject(),
    readingStats: { booksInProgress, booksCompleted, totalLikes, totalFavs, totalSubs, totalReviews },
  });
});

/* TOGGLE customer active status */
export const toggleCustomerStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 404, "Customer not found");
  user.isActive = !user.isActive;
  await user.save();
  await logActivity(req.user._id, user.isActive ? "ACTIVATE" : "DEACTIVATE", "Customer", user._id);
  return sendSuccess(res, 200, `Customer ${user.isActive ? "activated" : "deactivated"}`, { isActive: user.isActive });
});

/* DELETE customer */
export const deleteCustomer = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return sendError(res, 404, "Customer not found");
  await user.deleteOne();
  await logActivity(req.user._id, "DELETE", "Customer", req.params.id);
  return sendSuccess(res, 200, "Customer deleted");
});
