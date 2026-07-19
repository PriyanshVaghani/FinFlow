// =======================================
// 🌐 Global Error Handler Middleware
// =======================================
//
// Purpose:
// Catch all errors from routes/services and
// return a consistent API error response.
//
// How it works:
// - Routes call next(error)
// - Express forwards error to this middleware
// - Middleware sends formatted error response
//

const { sendError } = require("../utils/responseHelper");
const { redactSensitive } = require("../utils/sanitizeLog");

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  const isAuthRoute = req.originalUrl?.startsWith("/api/auth");

  // Never log raw auth bodies (password) or sensitive fields
  console.error("❌ API Error:", {
    statusCode,
    message,
    method: req.method,
    path: req.originalUrl,
    ...(process.env.NODE_ENV !== "production" && err.stack
      ? { stack: err.stack }
      : {}),
    ...(!isAuthRoute && req.body
      ? { body: redactSensitive(req.body) }
      : {}),
  });

  return sendError(res, {
    statusCode,
    message,
  });
};

module.exports = errorHandler;