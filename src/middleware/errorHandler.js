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

const errorHandler = (err, req, res, next) => {
  // Log full error for debugging
  console.error("❌ API Error:", err);

  // Use custom statusCode if available
  const statusCode = err.statusCode || 500;

  // Use custom message if available
  const message = err.message || "Internal Server Error";

  // Send standardized error response
  return sendError(res, {
    statusCode,
    message,
  });
};

module.exports = errorHandler;