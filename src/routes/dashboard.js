// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // ✅ MySQL DB connection (promise-based)
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware

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

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
