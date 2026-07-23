const rateLimit = require("express-rate-limit");
const { sendError } = require("../utils/apiResponse");

const handler = (req, res) =>
  sendError(res, 429, "Too many requests. Please slow down and try again.");

/**
 * Strict limiter for auth endpoints (login, forgot-password)
 * 10 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

/**
 * General API limiter for authenticated routes
 * 500 requests per minute per IP
 */
const apiLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             500,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

/**
 * Public routes limiter (school registration, health check)
 * 100 requests per minute per IP
 */
const publicLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             100,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

module.exports = { authLimiter, apiLimiter, publicLimiter };
