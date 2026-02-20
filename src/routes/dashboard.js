// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // ✅ MySQL DB connection (promise-based)
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
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
router.get("/summary", authenticationToken, async (req, res) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract query params
    const { month, year } = req.query;

    // 📅 Default to current month/year if not provided
    const selectedYear = year || new Date().getFullYear();

    /**
     * 📅 Determine Selected Month
     *
     * JavaScript's getMonth() returns 0–11:
     *   0 = January
     *   11 = December
     *
     * Since our API expects month in 1–12 format,
     * we add +1 to convert it.
     */
    const selectedMonth = month || new Date().getMonth() + 1;

    // 📆 Create date range (start & end of month)
    const startDate = `${selectedYear}-${selectedMonth}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0)
      .toISOString()
      .split("T")[0];

    /**
     * 📄 Aggregate income & expense totals
     * - Uses CASE statement to separate Income & Expense
     * - COALESCE ensures 0 if no records found
     */
    const [rows] = await db.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN c.type = 'Income' THEN t.amount ELSE 0 END), 0) AS totalIncome,
        COALESCE(SUM(CASE WHEN c.type = 'Expense' THEN t.amount ELSE 0 END), 0) AS totalExpense
      FROM transactions t
        JOIN categories c ON t.category_id = c.category_id
        WHERE t.user_id = ?
          AND t.trn_date BETWEEN ? AND ?;
      `,
      [userId, startDate, endDate],
    );

    // 🔢 Convert DB values to numbers
    const totalIncome = Number(rows[0].totalIncome);
    const totalExpense = Number(rows[0].totalExpense);

    // 💰 Calculate balance
    const balance = totalIncome - totalExpense;

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 200,
      data: {
        totalIncome,
        totalExpense,
        balance,
      },
    });
  } catch (error) {
    console.error(error);

    // ❌ Handle server errors
    return sendError(res, { statusCode: 500 });
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
router.get("/category-summary", authenticationToken, async (req, res) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract query params
    const { month, year } = req.query;

    // 📅 Default to current month/year if not provided
    const selectedYear = year || new Date().getFullYear();

    /**
     * 📅 Determine Selected Month
     *
     * JavaScript's getMonth() returns 0–11:
     *   0 = January
     *   11 = December
     *
     * Since our API expects month in 1–12 format,
     * we add +1 to convert it.
     */
    const selectedMonth = month || new Date().getMonth() + 1;

    // 📆 Create date range (start & end of month)
    const startDate = `${selectedYear}-${selectedMonth}-01`;
    const endDate = new Date(selectedYear, selectedMonth, 0)
      .toISOString()
      .split("T")[0];

    /**
     * 📄 Fetch expense totals grouped by category
     * - Only Expense type categories
     * - Grouped by category_id
     */
    const [result] = await db.query(
      `
      SELECT
        c.category_id,
        c.name,
        SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON t.category_id = c.category_id
      WHERE t.user_id = ?
        AND t.trn_date BETWEEN ? AND ?
        AND c.type = 'Expense'
      GROUP BY c.category_id;
      `,
      [userId, startDate, endDate],
    );

    // 🔥 Convert totals to number & format response
    const formattedResult = result.map((item) => ({
      categoryId: item.category_id,
      name: item.name,
      total: Number(item.total) || 0,
    }));

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 200,
      data: formattedResult,
    });
  } catch (error) {
    console.error(error);

    // ❌ Handle server errors
    return sendError(res, { statusCode: 500 });
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
router.get("/monthly-trend", authenticationToken, async (req, res) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract query params
    const { year } = req.query;

    // 📅 Default to current year if not provided
    const selectedYear = year || new Date().getFullYear();

    // 📆 Create yearly date range
    const startDate = `${selectedYear}-01-01`;
    const endDate = `${selectedYear}-12-31`;

    /**
     * 📄 Fetch monthly income & expense totals
     * - Groups by month number
     * - Separates Income and Expense using CASE
     */
    const [result] = await db.query(
      `
      SELECT
        MONTH(t.trn_date) AS month,
        SUM(CASE WHEN c.type = 'Income' THEN t.amount ELSE 0 END) AS income,
        SUM(CASE WHEN c.type = 'Expense' THEN t.amount ELSE 0 END) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.category_id
      WHERE t.user_id = ?
        AND t.trn_date BETWEEN ? AND ?
      GROUP BY MONTH(t.trn_date)
      ORDER BY MONTH(t.trn_date);
      `,
      [userId, startDate, endDate],
    );

    /**
     * 📊 Prepare default 12-month structure
     * Ensures frontend always receives complete year data
     */
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      income: 0,
      expense: 0,
    }));

    /**
     * 🔄 Map database results into default structure
     * Convert numeric fields safely
     */
    result.forEach((item) => {
      monthlyData[item.month - 1] = {
        month: item.month,
        income: Number(item.income) || 0,
        expense: Number(item.expense) || 0,
      };
    });

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 200,
      data: monthlyData,
    });
  } catch (error) {
    console.error(error);

    // ❌ Handle server errors
    return sendError(res, { statusCode: 500 });
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
router.get("/month-comparison", authenticationToken, async (req, res) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract query params
    const { month, year } = req.query;

    // 📅 Default to current month/year if not provided
    const selectedYear = year || new Date().getFullYear();

    /**
     * 📅 Determine Selected Month
     *
     * JavaScript's getMonth() returns 0–11:
     *   0 = January
     *   11 = December
     *
     * Since our API expects month in 1–12 format,
     * we add +1 to convert it.
     */
    const selectedMonth = month || new Date().getMonth() + 1;

    // 📆 Create current month date range
    const currentStart = `${selectedYear}-${selectedMonth}-01`;

    // Passing day = 0 gives the last day of previous month,
    // so using selectedMonth as 1-based gives correct last day.
    const currentEnd = new Date(selectedYear, selectedMonth, 0)
      .toISOString()
      .split("T")[0];

    /**
     * 🔄 Calculate Previous Month Dynamically
     *
     * Date constructor uses 0-based months.
     * selectedMonth is 1-based (1–12).
     *
     * selectedMonth - 2 converts it to previous month (0-based).
     *
     * Example:
     * If selectedMonth = 5 (May)
     * new Date(year, 3, 1) → April 1st
     *
     * This automatically handles:
     * January → December (previous year)
     */
    const prevDate = new Date(selectedYear, selectedMonth - 2, 1);

    const prevYear = prevDate.getFullYear();
    const prevMonth = prevDate.getMonth() + 1;

    const prevStart = `${prevYear}-${prevMonth}-01`;
    const prevEnd = new Date(prevYear, prevMonth, 0)
      .toISOString()
      .split("T")[0];

    /**
     * 📄 Summary Query Template
     * - Separates Income & Expense using CASE
     * - Filters by user_id
     * - Filters by date range
     */
    const summaryQuery = `
      SELECT
        SUM(CASE WHEN c.type = 'Income' THEN t.amount ELSE 0 END) AS income,
        SUM(CASE WHEN c.type = 'Expense' THEN t.amount ELSE 0 END) AS expense
      FROM transactions t
      JOIN categories c ON t.category_id = c.category_id
      WHERE t.user_id = ?
        AND t.trn_date BETWEEN ? AND ?;
    `;

    /**
     * 📊 Fetch current month data
     */
    const [[currentData]] = await db.query(summaryQuery, [
      userId,
      currentStart,
      currentEnd,
    ]);

    /**
     * 📊 Fetch previous month data
     */
    const [[prevData]] = await db.query(summaryQuery, [
      userId,
      prevStart,
      prevEnd,
    ]);

    // 🔢 Convert DB results to numbers
    const currentIncome = Number(currentData.income) || 0;
    const currentExpense = Number(currentData.expense) || 0;

    const prevIncome = Number(prevData.income) || 0;
    const prevExpense = Number(prevData.expense) || 0;

    /**
     * 📈 Calculate Percentage Change
     *
     * Formula:
     * ((current - previous) / previous) * 100
     *
     * Edge Case Handling:
     * - If previous = 0:
     *     → return 0 if current is also 0
     *     → return 100 if current > 0
     */
    const calculateChange = (current, previous) => {
      if (previous === 0) return current === 0 ? 0 : 100;
      return ((current - previous) / previous) * 100;
    };

    const incomeChangePercent = calculateChange(currentIncome, prevIncome);
    const expenseChangePercent = calculateChange(currentExpense, prevExpense);

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 200,
      data: {
        currentMonth: {
          income: currentIncome,
          expense: currentExpense,
        },
        previousMonth: {
          income: prevIncome,
          expense: prevExpense,
        },
        incomeChangePercent: Number(incomeChangePercent.toFixed(2)),
        expenseChangePercent: Number(expenseChangePercent.toFixed(2)),
      },
    });
  } catch (error) {
    console.error(error);

    // ❌ Handle server errors
    return sendError(res, { statusCode: 500 });
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
router.get("/recent-transactions", authenticationToken, async (req, res) => {
  // 🔐 Extract user ID from JWT middleware
  const userId = req.userId;

  // 📌 Number of recent transactions to fetch (default: 5)
  // parseInt ensures numeric value from query string
  const take = parseInt(req.query.take) || 5;

  // 🌐 Construct dynamic base URL from current request
  // Example:
  // http://localhost:5000
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  try {
    /**
     * 📦 Fetch latest transactions
     *
     * - Delegates DB + attachment formatting logic to service layer
     * - offset is fixed to 0 (always latest entries)
     * - baseUrl is passed so service can generate absolute file URLs
     */
    const transactions = await fetchTransactions(db, userId, {
      limit: take,
      offset: 0,
      baseUrl,
    });

    // ✅ Send standardized success response
    return sendSuccess(res, {
      data: transactions,
    });
  } catch (err) {
    /**
     * ❌ Handle unexpected errors
     * Returns 500 Internal Server Error
     */
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
