// =======================================
// 🔁 Async Handler Utility
// =======================================
// This utility removes the need for try-catch in every async route

/**
 * asyncHandler
 * - Accepts an async function (route handler)
 * - Automatically catches any errors
 * - Passes errors to Express error middleware using next()
 */
const asyncHandler = (fn) => (req, res, next) => {
  /**
   * 🔍 What is Promise?
   * A Promise is a JavaScript object that represents:
   * - A future result (success OR failure)
   *
   * States:
   * - pending   → still processing
   * - fulfilled → success
   * - rejected  → error
   *
   * Example:
   * new Promise((resolve, reject) => {
   *   resolve("Success"); // OR reject("Error");
   * });
   */

  /**
   * 🔍 What is Promise.resolve()?
   *
   * Promise.resolve(value) does:
   * - If value is already a Promise → returns it
   * - If value is NOT a Promise → wraps it into a Promise
   *
   * Why we use it here?
   * 👉 Because "fn" might be:
   *    - async function (returns Promise)
   *    - normal function (returns value)
   *
   * So Promise.resolve(fn(...)) ensures:
   * ✅ Everything becomes a Promise
   */

  Promise.resolve(fn(req, res, next))
    /**
     * 🔍 .catch(next)
     *
     * If Promise fails (rejects):
     * - This catch block runs
     * - It calls next(error)
     *
     * 👉 Express automatically sends this error
     *    to your global error handler middleware
     */
    .catch((err) => next(err));
};

module.exports = asyncHandler;