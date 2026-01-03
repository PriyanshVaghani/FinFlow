/**
 * =======================================
 * ✅ Standard Success Response Handler
 * =======================================
 *
 * @param {Object} res - Express response object
 * @param {Object} options - Response configuration
 * @param {number} options.statusCode - HTTP status code (default: 200)
 * @param {string} options.message - Success message
 * @param {*} options.data - Response payload (array/object)
 *
 * Usage:
 * sendSuccess(res, {
 *   statusCode: 200,
 *   message: "Data fetched successfully",
 *   data: result
 * });
 */
const sendSuccess = (res, { statusCode = 200, message = "", data = [] }) => {
  return res.status(statusCode).json({
    isError: false, // Indicates request was successful
    message, // Optional success message
    data, // Actual response data
  });
};

/**
 * =======================================
 * ❌ Standard Error Response Handler
 * =======================================
 *
 * @param {Object} res - Express response object
 * @param {Object} options - Error configuration
 * @param {number} options.statusCode - HTTP error status code (default: 400)
 * @param {string} options.message - Error description
 * @param {*} options.data - Optional error details
 *
 * Usage:
 * sendError(res, {
 *   statusCode: 422,
 *   message: "Validation failed",
 *   data: { field: "email" }
 * });
 */
const sendError = (
  res,
  { statusCode = 400, message = "Something went wrong", data = [] }
) => {
  return res.status(statusCode).json({
    isError: true, // Indicates request failed
    message, // Human-readable error message
    data, // Extra error information (optional)
  });
};

// 📤 Export helpers for reuse across the project
module.exports = { sendSuccess, sendError };
