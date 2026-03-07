// =======================================
// 📦 Import Required Modules
// =======================================
const db = require("../config/db");

// helper for calculating month start/end
const getMonthRange = (year, month) => {
  const start = `${year}-${month}-01`;
  const end = new Date(year, month, 0).toISOString().split("T")[0];
  return { start, end };
};

// helper for percentage change
const calculateChange = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
};

/**
 * ======================================================
 * 📊 MONTHLY SUMMARY SERVICE
 * ======================================================
 */
const getMonthlySummary = async (userId, month, year) => {
  const selectedYear = year || new Date().getFullYear();
  const selectedMonth = month || new Date().getMonth() + 1;
  const { start, end } = getMonthRange(selectedYear, selectedMonth);

  // calculate total income & expense for the user within the date range
  // uses CASE expressions to separate types and COALESCE to default zeros
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - transactions (t) → Financial transaction records
   * - categories (c)   → Category type information
   *
   * JOIN categories:
   * - Links transactions to their category types
   *
   * CASE Expressions:
   * - Separates income and expense amounts
   * - WHEN c.type = 'Income' THEN t.amount ELSE 0
   * - WHEN c.type = 'Expense' THEN t.amount ELSE 0
   *
   * SUM + COALESCE:
   * - Aggregates amounts by type
   * - COALESCE ensures 0 when no transactions exist
   *
   * WHERE Clause:
   * - user_id isolates user data
   * - trn_date BETWEEN filters date range
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
    [userId, start, end],
  );

  const totalIncome = Number(rows[0].totalIncome);
  const totalExpense = Number(rows[0].totalExpense);
  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
  };
};

/**
 * ======================================================
 * 📊 CATEGORY SUMMARY SERVICE
 * ======================================================
 */
const getCategorySummary = async (userId, month, year) => {
  const selectedYear = year || new Date().getFullYear();
  const selectedMonth = month || new Date().getMonth() + 1;
  const { start, end } = getMonthRange(selectedYear, selectedMonth);

  // group expenses by category for the given month range
  // returns category_id, name, and summed amount
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - transactions (t) → Financial transaction records
   * - categories (c)   → Category metadata
   *
   * JOIN categories:
   * - Links transactions to category details
   *
   * SUM:
   * - Aggregates transaction amounts per category
   *
   * WHERE Clause:
   * - user_id isolates user data
   * - trn_date BETWEEN filters date range
   * - c.type = 'Expense' limits to expense categories
   *
   * GROUP BY c.category_id:
   * - Groups results by category for aggregation
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
    [userId, start, end],
  );

  return result.map((item) => ({
    categoryId: item.category_id,
    name: item.name,
    total: Number(item.total) || 0,
  }));
};

/**
 * ======================================================
 * 📈 MONTHLY TREND SERVICE
 * ======================================================
 */
const getMonthlyTrend = async (userId, year) => {
  const selectedYear = year || new Date().getFullYear();
  const startDate = `${selectedYear}-01-01`;
  const endDate = `${selectedYear}-12-31`;

  // compute monthly income & expense totals for the entire year
  // GROUP BY month number, order chronologically
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - transactions (t) → Financial transaction records
   * - categories (c)   → Category type information
   *
   * JOIN categories:
   * - Links transactions to their category types
   *
   * MONTH(t.trn_date):
   * - Extracts month number (1-12) from transaction date
   *
   * CASE Expressions:
   * - Separates income and expense amounts by month
   * - WHEN c.type = 'Income' THEN t.amount ELSE 0
   * - WHEN c.type = 'Expense' THEN t.amount ELSE 0
   *
   * SUM:
   * - Aggregates amounts by month and type
   *
   * WHERE Clause:
   * - user_id isolates user data
   * - trn_date BETWEEN covers full year
   *
   * GROUP BY MONTH(t.trn_date):
   * - Groups by month for monthly totals
   *
   * ORDER BY MONTH(t.trn_date):
   * - Sorts results chronologically
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

  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
  }));

  result.forEach((item) => {
    monthlyData[item.month - 1] = {
      month: item.month,
      income: Number(item.income) || 0,
      expense: Number(item.expense) || 0,
    };
  });

  return monthlyData;
};

/**
 * ======================================================
 * 📊 MONTH COMPARISON SERVICE
 * ======================================================
 */
const getMonthComparison = async (userId, month, year) => {
  const selectedYear = year || new Date().getFullYear();
  const selectedMonth = month || new Date().getMonth() + 1;

  const currentStart = `${selectedYear}-${selectedMonth}-01`;
  const currentEnd = new Date(selectedYear, selectedMonth, 0)
    .toISOString()
    .split("T")[0];

  const prevDate = new Date(selectedYear, selectedMonth - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  const prevStart = `${prevYear}-${prevMonth}-01`;
  const prevEnd = new Date(prevYear, prevMonth, 0).toISOString().split("T")[0];

  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - transactions (t) → Financial transaction records
   * - categories (c)   → Category type information
   *
   * JOIN categories:
   * - Links transactions to their category types
   *
   * CASE Expressions:
   * - Separates income and expense amounts
   * - WHEN c.type = 'Income' THEN t.amount ELSE 0
   * - WHEN c.type = 'Expense' THEN t.amount ELSE 0
   *
   * SUM:
   * - Aggregates amounts by type for the period
   *
   * WHERE Clause:
   * - user_id isolates user data
   * - trn_date BETWEEN filters specific month range
   *
   * Note: This query is executed twice - once for current month,
   * once for previous month to calculate comparison metrics.
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

  // run the same summary query twice: once for current month,
  // once for previous month. helper query defined earlier.
  const [[currentData]] = await db.query(summaryQuery, [
    userId,
    currentStart,
    currentEnd,
  ]);
  const [[prevData]] = await db.query(summaryQuery, [
    userId,
    prevStart,
    prevEnd,
  ]);

  const currentIncome = Number(currentData.income) || 0;
  const currentExpense = Number(currentData.expense) || 0;
  const prevIncome = Number(prevData.income) || 0;
  const prevExpense = Number(prevData.expense) || 0;

  return {
    currentMonth: { income: currentIncome, expense: currentExpense },
    previousMonth: { income: prevIncome, expense: prevExpense },
    incomeChangePercent: Number(
      calculateChange(currentIncome, prevIncome).toFixed(2),
    ),
    expenseChangePercent: Number(
      calculateChange(currentExpense, prevExpense).toFixed(2),
    ),
  };
};

// export
module.exports = {
  getMonthlySummary,
  getCategorySummary,
  getMonthlyTrend,
  getMonthComparison,
};
