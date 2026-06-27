const logger = require("../config/logger");

/**
 * Global Express error handler
 * Must have 4 parameters for Express to treat it as an error handler
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Log full error
  logger.error(`${req.method} ${req.originalUrl} — ${err.message}`, {
    stack: err.stack,
    body:  req.body,
  });

  // ── Prisma errors ────────────────────────────────────────────
  if (err.code === "P2002") {
    // Unique constraint violation
    const field = err.meta?.target?.[0] || "field";
    return res.status(409).json({
      success: false,
      message: `A record with this ${field} already exists.`,
    });
  }

  if (err.code === "P2025") {
    // Record not found
    return res.status(404).json({
      success: false,
      message: err.meta?.cause || "Record not found.",
    });
  }

  if (err.code === "P2003") {
    // Foreign key constraint failed
    return res.status(400).json({
      success: false,
      message: "Related record does not exist.",
    });
  }

  // ── JWT errors ───────────────────────────────────────────────
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token.",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token has expired.",
    });
  }

  // ── Multer / file upload errors ──────────────────────────────
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File is too large. Maximum size is 5MB.",
    });
  }

  // ── CORS error ───────────────────────────────────────────────
  if (err.message && err.message.startsWith("CORS blocked")) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  // ── Custom operational errors (thrown intentionally) ─────────
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      success: false,
      message: err.message,
    });
  }

  // ── Default: 500 Internal Server Error ───────────────────────
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : err.message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
};

/**
 * Create a custom operational error (expected errors like 404, 403)
 */
const createError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode   = statusCode;
  err.isOperational = true;
  return err;
};

module.exports = errorHandler;
module.exports.createError = createError;
