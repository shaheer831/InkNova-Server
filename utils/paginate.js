/**
 * utils/paginate.js
 * Reusable pagination helper for all list endpoints.
 * Supports page/limit, sorting, projection, and population.
 */

/**
 * Parse pagination params from query string.
 * @param {object} query - req.query
 * @returns {{ page, limit, skip, sortBy, order }}
 */
export const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy || "createdAt";
  const order = query.order === "asc" ? 1 : -1;
  return { page, limit, skip, sortBy, order };
};

/**
 * Build mongoose sort object.
 */
export const buildSort = (sortBy, order) => ({ [sortBy]: order });

/**
 * Execute paginated query and return data + meta.
 * @param {Model} model - Mongoose model
 * @param {object} filter - Mongoose filter
 * @param {object} options - { page, limit, skip, sortBy, order, populate, select }
 * @returns {{ data, meta }}
 */
export const paginateQuery = async (model, filter, options) => {
  const { page, limit, skip, sortBy, order, populate = [], select = null } = options;

  let query = model
    .find(filter)
    .sort(buildSort(sortBy, order))
    .skip(skip)
    .limit(limit);

  if (select) query = query.select(select);

  // Support single string or array of populate options
  if (Array.isArray(populate)) {
    populate.forEach((p) => {
      query = query.populate(p);
    });
  } else if (populate) {
    query = query.populate(populate);
  }

  const [data, total] = await Promise.all([query.exec(), model.countDocuments(filter)]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  };
};
