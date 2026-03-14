// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
const {
  getMonthlySummary,
  getCategorySummary,
  getMonthlyTrend,
  getMonthComparison,
} = require("../services/dashboard.service");
const { fetchTransactions } = require("../services/transaction.service");
/**
 * ======================================================
 * 📊 MONTHLY SUMMARY (INCOME / EXPENSE / BALANCE)
 * ======================================================
 * @route   GET /summary
 * @desc    Get total income, total expense and balance for selected month
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Calculate monthly income total
 * - Calculate monthly expense total
 * - Return net balance (income - expense)
 * - Default to current month if not provided
 */
router.get("/summary", authenticationToken, async (req, res, next) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract query params
    const { month, year } = req.query;
    const data = await getMonthlySummary(userId, month, year);
    return sendSuccess(res, { statusCode: 200, data });
  } catch (err) {
    // ❌ Handle server errors
    next(err);
  }
});

/**
 * ======================================================
 * 📊 CATEGORY-WISE EXPENSE SUMMARY
 * ======================================================
 * @route   GET /category-summary
 * @desc    Get expense totals grouped by category for selected month
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Group expenses by category
 * - Return total spent per category
 * - Default to current month if not provided
 */
router.get("/category-summary", authenticationToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const { month, year } = req.query;
    const data = await getCategorySummary(userId, month, year);
    return sendSuccess(res, { statusCode: 200, data });
  } catch (err) {
    // ❌ Handle server errors
    next(err);
  }
});

/**
 * ======================================================
 * 📈 YEARLY MONTHLY TREND (INCOME vs EXPENSE)
 * ======================================================
 * @route   GET /monthly-trend
 * @desc    Get month-wise income and expense summary for selected year
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Aggregate income & expense grouped by month
 * - Return full 12-month structure (even if no data)
 * - Default to current year if not provided
 */
router.get("/monthly-trend", authenticationToken, async (req, res, next) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract query params
    const { year } = req.query;
    const data = await getMonthlyTrend(userId, year);
    return sendSuccess(res, { statusCode: 200, data });
  } catch (err) {
    // ❌ Handle server errors
    next(err);
  }
});

/**
 * ======================================================
 * 📊 Month Comparison API (Current vs Previous Month)
 * ======================================================
 * @route   GET /month-comparison
 * @access  Private (JWT Protected)
 *
 * @description
 * This endpoint compares total Income and Expense between:
 *   1️⃣ Selected Month
 *   2️⃣ Previous Month
 *
 * If month/year are not provided in query params,
 * it defaults to the current system month and year.
 *
 * Responsibilities:
 * - Determine selected month & year
 * - Automatically calculate previous month (handles year transition)
 * - Fetch income & expense totals for both months
 * - Calculate percentage change
 * - Safely handle divide-by-zero cases
 */
router.get("/month-comparison", authenticationToken, async (req, res, next) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract query params
    const { month, year } = req.query;
    const data = await getMonthComparison(userId, month, year);
    return sendSuccess(res, { statusCode: 200, data });
  } catch (err) {
    // ❌ Handle server errors
    next(err);
  }
});

/**
 * ======================================================
 * 📥 GET /recent-transactions
 * ======================================================
 * @route   GET /recent-transactions
 * @desc    Fetch most recent transactions of the logged-in user
 * @access  Private (JWT protected)
 *
 * Query Params:
 * - take (optional) → Number of recent records to return (default: 5)
 *
 * Responsibilities:
 * - Extract authenticated user ID
 * - Construct base URL for attachment links
 * - Fetch latest transactions using service layer
 * - Return standardized success response
 *
 * Notes:
 * - Always fetches from offset 0 (latest records only)
 * - baseUrl is generated at controller level (request-aware)
 * - baseUrl is passed to service layer for attachment URL construction
 * - Keeps service reusable while allowing dynamic URL generation
 */
router.get(
  "/recent-transactions",
  authenticationToken,
  async (req, res, next) => {
    try {
      // 🔐 Extract user ID from JWT middleware
      const userId = req.userId;

      // 📌 Number of recent transactions to fetch (default: 5)
      // parseInt ensures numeric value from query string
      const take = Number.isInteger(Number(req.query.take))
        ? Number(req.query.take)
        : 5;

      // 🌐 Construct dynamic base URL from current request
      // Example:
      // http://localhost:5000
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      /**
       * 📦 Fetch latest transactions
       *
       * - Delegates DB + attachment formatting logic to service layer
       * - offset is fixed to 0 (always latest entries)
       * - baseUrl is passed so service can generate absolute file URLs
       */
      const transactions = await fetchTransactions(userId, {
        limit: take,
        offset: 0,
        baseUrl,
      });

      // ✅ Send standardized success response
      return sendSuccess(res, {
        data: transactions,
      });
    } catch (err) {
      // ❌ Handle server errors
      next(err);
    }
  },
);

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
