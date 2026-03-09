/**
 * controllers/activityController.js
 * Read-only activity log endpoints.
 */
import { ActivityLog } from "../models/index.js";
import { sendSuccess, sendError } from "../utils/response.js";
import { asyncHandler } from "../utils/helpers.js";
import { parsePagination, paginateQuery } from "../utils/paginate.js";
import { fieldFilter, keywordFilter, dateRangeFilter, mergeFilters } from "../utils/filters.js";

export const listActivityLogs = asyncHandler(async (req, res) => {
  const { page, limit, skip, sortBy, order } = parsePagination(req.query);
  const { userId, entity, action, dateFrom, dateTo } = req.query;

  const eqFilter = fieldFilter({ userId, entity, action }, ["userId", "entity", "action"]);
  const dateFilter = dateRangeFilter(dateFrom, dateTo);
  const filter = mergeFilters(eqFilter, dateFilter ? { createdAt: dateFilter } : null);

  const { data, meta } = await paginateQuery(ActivityLog, filter, {
    page, limit, skip, sortBy: sortBy || "createdAt", order,
    populate: [{ path: "userId", select: "name email" }],  // removed 'role' — field no longer exists
  });
  return sendSuccess(res, 200, "Activity logs retrieved", data, meta);
});

export const getActivityLogById = asyncHandler(async (req, res) => {
  const log = await ActivityLog.findById(req.params.id)
    .populate("userId", "name email");   // removed 'role'
  if (!log) return sendError(res, 404, "Log not found");
  return sendSuccess(res, 200, "Log retrieved", log);
});