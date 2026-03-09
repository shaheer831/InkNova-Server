/**
 * middlewares/errorHandler.js
 * Global Express error handling middleware.
 * Handles: validation errors, JWT errors, Mongoose duplicate key, and generic errors.
 */
import logger from "../utils/logger.js";

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errors = null;

  // ── Mongoose Validation Error ─────────────────────────────────────
  if (err.name === "ValidationError") {
    statusCode = 422;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }
  // ── Mongoose Cast Error (bad ObjectId) ────────────────────────────
  else if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for field: ${err.path}`;
  }
  // ── MongoDB Duplicate Key ─────────────────────────────────────────
  else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `Duplicate value: ${field} already exists`;
  }
  // ── JWT Errors ────────────────────────────────────────────────────
  else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
  }

  // ── Log server errors ─────────────────────────────────────────────
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${statusCode}: ${err.message}`, {
      stack: err.stack,
    });
  }

  const response = { success: false, message };
  if (errors) response.errors = errors;
  if (process.env.NODE_ENV === "development") response.stack = err.stack;

  return res.status(statusCode).json(response);
};

export default errorHandler;
