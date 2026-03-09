/**
 * utils/response.js
 * Reusable HTTP response formatter for consistent API responses.
 */

/**
 * Send a success response.
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code (default 200)
 * @param {string} message - Human-readable success message
 * @param {*} data - Response payload
 * @param {object} meta - Optional metadata (pagination, etc.)
 */
export const sendSuccess = (res, statusCode = 200, data = null, message = "Success", meta = null) => {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  return res.status(statusCode).json(response);
};

/**
 * Send an error response.
 * @param {Response} res - Express response object
 * @param {number} statusCode - HTTP status code (default 500)
 * @param {string} message - Error message
 * @param {*} errors - Optional error details
 */
export const sendError = (res, statusCode = 500, message = "Internal Server Error", errors = null) => {
  const response = { success: false, message };
  if (errors !== null) response.errors = errors;
  return res.status(statusCode).json(response);
};
