/**
 * =======================================
 * ✅ Standard Success Response Handler
 * =======================================
 *
 * @description
 * Sends a consistent success response structure across the API.
 * Automatically:
 * - Sets isError to false
 * - Includes message only if provided
 * - Includes data only if provided
 * - Allows additional root-level fields (e.g., pagination metadata)
 *
 * @param {Object} res - Express response object
 * @param {Object} options - Response configuration object
 * @param {number} [options.statusCode=200] - HTTP status code
 * @param {string} [options.message] - Optional success message
 * @param {*} [options.data] - Optional response payload (array/object)
 * @param {..*} [options.extra] - Additional root-level properties
 *                                  (e.g., totalCount, skip, take, hasMore)
 *
 * @example
 * sendSuccess(res, {
 *   message: "Data fetched successfully",
 *   data: result,
 *   totalCount: 50,
 *   skip: 0,
 *   take: 10,
 *   hasMore: true
 * });
 *
 * @returns {Object} JSON response:
 * {
 *   isError: false,
 *   message?: string,
 *   data?: any,
 *   ...extraFields
 * }
 */
const sendSuccess = (
  res,
  { statusCode = 200, message, data, ...extra } = {},
) => {
  const response = {
    isError: false,
  };

  // Add message only if provided
  if (message !== undefined) {
    response.message = message;
  }

  // Add data only if provided
  if (data !== undefined) {
    response.data = data;
  }
  // Spread extra root-level properties
  Object.assign(response, extra);

  return res.status(statusCode).json(response);
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
 *
 * Usage:
 * sendError(res, {
 *   statusCode: 422,
 *   message: "Validation failed",
 * });
 */
const sendError = (
  res,
  { statusCode = 400, message = "Something went wrong" },
) => {
  return res.status(statusCode).json({
    isError: true, // Indicates request failed
    message, // Human-readable error messages
  });
};

// 📤 Export helpers for reuse across the project
module.exports = { sendSuccess, sendError };
