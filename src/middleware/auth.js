const { verifyAccessToken } = require("../utils/generateToken");
const { sendError }         = require("../utils/apiResponse");

/**
 * Verify JWT access token from Authorization header
 * Attaches decoded payload to req.user
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, 401, "Access token required.");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded; // { userId, schoolId, role, email }
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return sendError(res, 401, "Access token has expired.");
    }
    return sendError(res, 401, "Invalid access token.");
  }
};

module.exports = authenticate;
