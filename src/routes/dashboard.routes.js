// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();

const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
const asyncHandler = require("../utils/asyncHandler"); // 🔁 Handles async errors (removes try-catch)

// 🛡️ Dashboard request validators
// These middlewares validate query parameters before reaching controller logic
const {
  validateMonthlySummary,
  validateCategorySummary,
  validateMonthlyTrend,
  validateMonthComparison,
  validateRecentTransactions,
} = require("../validators/dashboard.validator");

// 📊 Dashboard service functions (business logic layer)
const {
  getMonthlySummary,
  getCategorySummary,
  getMonthlyTrend,
  getMonthComparison,
} = require("../services/dashboard.service");

// 📂 Transaction service for fetching recent transactions
const { fetchTransactions } = require("../services/transaction.service");

/**
 * ======================================================
 * 📌 TAG: Dashboard APIs
 * ======================================================
 */

/**
 * ======================================================
 * 📊 MONTHLY SUMMARY (INCOME / EXPENSE / BALANCE)
 * ======================================================
 * @route   GET /api/dashboard/summary
 * @desc    Get total income, total expense and balance for selected month
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate optional query params (month, year) via middleware.
 * - Fetch monthly summary via service, which calculates income, expense, and balance.
 * - Service defaults to the current month/year if not provided.
 * - Send success response with summary data.
 */
/**
 * @swagger
 * /api/dashboard/summary:
 *   get:
 *     summary: Monthly summary
 *     description: Get total income, expense and balance
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *         description: "Month to get summary for (1-12). Defaults to current month."
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: "Year to get summary for. Defaults to current year."
 *     responses:
 *       200:
 *         description: Summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Data fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     income:
 *                       type: number
 *                       example: 5000
 *                     expense:
 *                       type: number
 *                       example: 2500
 *                     balance:
 *                       type: number
 *                       example: 2500
 */
router.get(
  "/summary",
  authenticationToken,
  validateMonthlySummary,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID extracted from JWT middleware
    const userId = req.userId;

    // 📥 Extract validated query parameters
    const { month, year } = req.query;

    // 📊 Fetch monthly summary data
    const data = await getMonthlySummary(userId, month, year);

    // ✅ Send standardized success response
    return sendSuccess(res, { statusCode: 200, data });
  }),
);

/**
 * ======================================================
 * 📊 CATEGORY-WISE EXPENSE SUMMARY
 * ======================================================
 * @route   GET /api/dashboard/category-summary
 * @desc    Get expense totals grouped by category for selected month
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate optional query params (month, year) via middleware.
 * - Fetch category summary via service, which groups expenses and calculates totals.
 * - Service defaults to the current month/year if not provided.
 * - Send success response with category data.
 */
/**
 * @swagger
 * /api/dashboard/category-summary:
 *   get:
 *     summary: Category-wise expense summary
 *     description: Get expenses grouped by category
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *         description: "Month to get summary for (1-12). Defaults to current month."
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: "Year to get summary for. Defaults to current year."
 *     responses:
 *       200:
 *         description: Category summary fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Data fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       categoryId:
 *                         type: integer
 *                       categoryName:
 *                         type: string
 *                       total:
 *                         type: number
 *                       percentage:
 *                         type: number
 *                   example:
 *                     - categoryId: 1
 *                       categoryName: "Groceries"
 *                       total: 500
 *                       percentage: 45.5
 */
router.get(
  "/category-summary",
  authenticationToken,
  validateCategorySummary,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract validated query parameters
    const { month, year } = req.query;

    // 📊 Fetch category summary
    const data = await getCategorySummary(userId, month, year);

    return sendSuccess(res, { statusCode: 200, data });
  }),
);

/**
 * ======================================================
 * 📈 YEARLY MONTHLY TREND (INCOME vs EXPENSE)
 * ======================================================
 * @route   GET /api/dashboard/monthly-trend
 * @desc    Get month-wise income and expense summary for selected year
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate optional query param (year) via middleware.
 * - Fetch monthly trend via service, which aggregates income/expense for all 12 months.
 * - Service defaults to the current year if not provided.
 * - Send success response with trend data.
 */
/**
 * @swagger
 * /api/dashboard/monthly-trend:
 *   get:
 *     summary: Monthly trend
 *     description: Get income vs expense trend for a year
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: "Year to get trend for. Defaults to current year."
 *     responses:
 *       200:
 *         description: Trend fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Data fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       month:
 *                         type: string
 *                         example: "January"
 *                       income:
 *                         type: number
 *                         example: 5000
 *                       expense:
 *                         type: number
 *                         example: 2500
 */
router.get(
  "/monthly-trend",
  authenticationToken,
  validateMonthlyTrend,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract validated query parameters
    const { year } = req.query;

    // 📈 Fetch yearly trend data
    const data = await getMonthlyTrend(userId, year);

    return sendSuccess(res, { statusCode: 200, data });
  }),
);

/**
 * ======================================================
 * 📊 Month Comparison API (Current vs Previous Month)
 * ======================================================
 * @route   GET /api/dashboard/month-comparison
 * @access  Private (JWT Protected)
 *
 * @desc
 * Compares total Income and Expense between a selected month and the previous one.
 *
 * Flow:
 * - Validate optional query params (month, year) via middleware.
 * - Fetch comparison data via service, which calculates totals for both months and their percentage change.
 * - Service defaults to the current month/year and handles year transitions automatically.
 * - Send success response with comparison data.
 */
/**
 * @swagger
 * /api/dashboard/month-comparison:
 *   get:
 *     summary: Month comparison
 *     description: Compare current month vs previous month income & expense
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *         description: "Month to compare (1-12). Defaults to current month."
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: "Year to compare. Defaults to current year."
 *     responses:
 *       200:
 *         description: Comparison fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Data fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     currentMonth:
 *                       type: object
 *                       properties:
 *                         income:
 *                           type: number
 *                         expense:
 *                           type: number
 *                     previousMonth:
 *                       type: object
 *                       properties:
 *                         income:
 *                           type: number
 *                         expense:
 *                           type: number
 *                     incomeChange:
 *                       type: number
 *                       description: "Percentage change in income"
 *                     expenseChange:
 *                       type: number
 *                       description: "Percentage change in expense"
 *                   example:
 *                     currentMonth: { income: 5000, expense: 2500 }
 *                     previousMonth: { income: 4000, expense: 3000 }
 *                     incomeChange: 25
 *                     expenseChange: -16.67
 */
router.get(
  "/month-comparison",
  authenticationToken,
  validateMonthComparison,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract validated query parameters
    const { month, year } = req.query;

    // 📊 Fetch comparison data
    const data = await getMonthComparison(userId, month, year);

    return sendSuccess(res, { statusCode: 200, data });
  }),
);

/**
 * ======================================================
 * 📥 GET /recent-transactions
 * ======================================================
 * @route   GET /api/dashboard/recent-transactions
 * @desc    Fetch most recent transactions of the logged-in user
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate optional query param (take) via middleware.
 * - Construct a dynamic base URL for attachment links.
 * - Fetch the latest transactions via service, passing the base URL for link generation.
 * - Send success response with transaction data.
 */
/**
 * @swagger
 * /api/dashboard/recent-transactions:
 *   get:
 *     summary: Recent transactions
 *     description: Get latest transactions of user
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           example: 5
 *         description: "Number of recent transactions to return. Defaults to 5."
 *     responses:
 *       200:
 *         description: Transactions fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Data fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           trnId:
 *                             type: integer
 *                           amount:
 *                             type: number
 *                           note:
 *                             type: string
 *                           trnDate:
 *                             type: string
 *                             format: date
 *                           categoryId:
 *                             type: integer
 *                           categoryName:
 *                             type: string
 *                           type:
 *                             type: string
 *                             enum: [income, expense]
 *                           attachments:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                 url:
 *                                   type: string
 *                     total:
 *                       type: integer
 */
router.get(
  "/recent-transactions",
  authenticationToken,
  validateRecentTransactions,
  asyncHandler(async (req, res) => {
    // 🔐 Extract user ID from JWT middleware
    const userId = req.userId;

    // 📌 Number of recent transactions to fetch (default: 5)
    // Ensures numeric value from query string
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
  }),
);

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
