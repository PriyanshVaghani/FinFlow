const jwt = require("jsonwebtoken");
const { sendError } = require("../utils/responseHelper");

/**
 * 🔐 Authentication Middleware
 * Verifies JWT token and attaches userId to request
 */
function authenticationToken(req, res, next) {
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
    // 3️⃣ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4️⃣ Attach userId to request
    req.userId = decoded.userId;

    // 5️⃣ Continue request
    next();
  } catch (err) {
    return sendError(res, {
      statusCode: 401,
      message: "Unauthorized: Invalid or expired token",
    });
  }
}

module.exports = { authenticationToken };
