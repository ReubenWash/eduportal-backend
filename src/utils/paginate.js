/**
 * Parse pagination params from query string
 * @param {object} query - req.query
 * @returns {{ skip: number, take: number, page: number, limit: number }}
 */
const getPagination = (query) => {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip  = (page - 1) * limit;
  return { skip, take: limit, page, limit };
};

/**
 * Build a paginated response envelope
 * @param {Array}  data   - The result records
 * @param {number} total  - Total count from DB
 * @param {number} page   - Current page
 * @param {number} limit  - Page size
 */
const paginatedResponse = (data, total, page, limit) => {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
};

module.exports = { getPagination, paginatedResponse };
