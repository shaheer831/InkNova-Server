/**
 * utils/filters.js
 * Reusable filter builder for list endpoints.
 * Supports keyword search, date ranges, field equality, etc.
 */

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build a date range filter for a given field.
 * @param {string} from - ISO date string start
 * @param {string} to - ISO date string end
 * @returns {object} Mongoose date range query
 */
export const dateRangeFilter = (from, to) => {
  const filter = {};
  if (from) filter.$gte = new Date(from);
  if (to) filter.$lte = new Date(to);
  return Object.keys(filter).length ? filter : null;
};

/**
 * Build a keyword search filter across multiple fields.
 * @param {string} keyword - Search string
 * @param {string[]} fields - Fields to search
 * @returns {object} Mongoose $or query
 */
export const keywordFilter = (keyword, fields = []) => {
  if (!keyword || !fields.length) return null;
  const regex = new RegExp(escapeRegex(keyword), "i");
  return { $or: fields.map((f) => ({ [f]: regex })) };
};

/**
 * Merge multiple filter objects safely using $and when there are multiple.
 * Avoids silent key overwrites from Object.assign.
 * @param {...object} filters
 * @returns {object} merged filter
 */
export const mergeFilters = (...filters) => {
  const valid = filters.filter((f) => f && typeof f === "object" && Object.keys(f).length > 0);
  if (valid.length === 0) return {};
  if (valid.length === 1) return valid[0];
  return { $and: valid };
};

/**
 * Build a standard status / field equality filter from query params.
 * Only includes defined, non-empty values.
 * @param {object} params - key/value pairs from req.query
 * @param {string[]} allowedFields - whitelist of filterable fields
 * @returns {object}
 */
export const fieldFilter = (params, allowedFields = []) => {
  const filter = {};
  allowedFields.forEach((field) => {
    if (params[field] !== undefined && params[field] !== "") {
      filter[field] = params[field];
    }
  });
  return filter;
};
