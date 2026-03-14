/**
 * utils/paginate.js
 * Reusable pagination helper. Supports customSort for preset sort objects.
 */
export const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy || "createdAt";
  const order = query.order === "asc" ? 1 : -1;
  return { page, limit, skip, sortBy, order };
};

export const buildSort = (sortBy, order) => ({ [sortBy]: order });

export const paginateQuery = async (model, filter, options) => {
  const { page, limit, skip, sortBy, order, populate = [], select = null, customSort } = options;
  const sortObj = customSort || buildSort(sortBy, order);

  let query = model.find(filter).sort(sortObj).skip(skip).limit(limit);
  if (select) query = query.select(select);
  if (Array.isArray(populate)) populate.forEach((p) => { query = query.populate(p); });
  else if (populate) query = query.populate(populate);

  const [data, total] = await Promise.all([query.exec(), model.countDocuments(filter)]);
  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page * limit < total, hasPrevPage: page > 1 },
  };
};
