const jwt = require("jsonwebtoken");
const { sendError } = require("../utils/responseHelper");
const db = require("../config/db");

/**
 * 🔐 Authentication Middleware
 * Verifies JWT token and attaches userId to request
 */
async function authenticationToken(req, res, next) {
  const authHeader = req.headers.authorization;

  // 1️⃣ Check Authorization header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendError(res, {
      statusCode: 401,
      message: "Unauthorized: Token missing",
    });
  }

  // 2️⃣ Extract token
  const token = authHeader.split(" ")[1];

  try {
    // 3️⃣ Check if token is in the blacklist
    const [blacklisted] = await db.query(
      "SELECT id FROM token_blacklist WHERE token = ?",
      [token],
    );

    if (blacklisted.length > 0) {
      return sendError(res, {
        statusCode: 401,
        message: "Unauthorized: Token has been invalidated",
      });
    }

    // 4️⃣ Verify JWT Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 5️⃣ Attach userId to request
    req.userId = decoded.userId;

    // 6️⃣ Continue request
    next();
  } catch (err) {
    // Handle JWT specific errors (invalid signature, expired, etc.)
    if (
      ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(
        err.name,
      )
    ) {
      console.error("🚨 JWT Error:", err.message);
      return sendError(res, {
        statusCode: 401,
        message: "Unauthorized: Invalid or expired token",
      });
    }

    // Handle Database or other server errors
    console.error("🚨 DB/Server Error in Auth Middleware:", err);
    return sendError(res, {
      statusCode: 500,
      message: "Internal server error during authentication",
    });
  }
}

module.exports = { authenticationToken };
