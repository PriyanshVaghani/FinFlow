// =======================================
// 📦 Import Required Modules
// =======================================
const db = require("../config/db");

/**
 * ======================================================
 * 📥 FETCH BUDGETS SERVICE
 * ======================================================
 * Retrieves budgets for a given user & month, including
 * calculated spend per category.
 */
const getBudgets = async (userId, month) => {
  try {
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets (b)      → Stores monthly budget records
     * - categories (c)   → Category metadata
     * - transactions (t) → Used to calculate spending
     *
     * JOIN categories:
     * - Ensures category details are included
     *
     * LEFT JOIN transactions:
     * - Allows budgets to appear even if no transactions exist
     *
     * DATE_FORMAT:
     * - Filters transactions by same YYYY-MM as budget
     *
     * COALESCE:
     * - Returns 0 if SUM(t.amount) is NULL
     *
     * CAST(... AS DOUBLE):
     * - Ensures numeric values are returned (not strings)
     */
    const [rows] = await db.query(
      `
        SELECT 
          b.budget_id,
          b.month,
          CAST(b.amount AS DOUBLE) AS budgetAmount,
          c.category_id,
          c.name AS categoryName,
          CAST(COALESCE(SUM(t.amount), 0) AS DOUBLE) AS spentAmount
        FROM budgets b
        JOIN categories c
          ON b.category_id = c.category_id
        LEFT JOIN transactions t
          ON t.category_id = b.category_id
          AND t.user_id = b.user_id
          AND DATE_FORMAT(t.trn_date, '%Y-%m') = b.month
        WHERE b.user_id = ?
          AND b.month = ?
        GROUP BY b.budget_id;
      `,
      [userId, month],
    );

    return rows;
  } catch (err) {
    throw err;
  }
};

/**
 * ======================================================
 * ➕ ADD BUDGET SERVICE
 * ======================================================
 * Inserts a new budget after validating category and
 * ensuring no duplicate exists for the same month/category.
 */
const addBudget = async (userId, categoryId, month, amount) => {
  try {
    // validate category is expense and active
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - categories → Category definitions and metadata
     *
     * WHERE Clause:
     * - category_id matches specific category
     * - type = 'Expense' ensures only expense categories allowed
     * - (user_id IS NULL OR user_id = ?) allows system or user categories
     * - is_active = 1 ensures category is not deleted
     */
    const [category] = await db.query(
      `
      SELECT category_id FROM categories
      WHERE category_id = ?
        AND type = 'Expense'
        AND (user_id IS NULL OR user_id = ?)
        AND is_active = 1
      `,
      [categoryId, userId],
    );

    if (category.length === 0) {
      throw new Error("Invalid expense category");
    }

    // prevent duplicates
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets → Monthly budget records
     *
     * WHERE Clause:
     * - user_id ensures user isolation
     * - category_id and month prevent duplicate budgets
     */
    const [existingBudget] = await db.query(
      `
      SELECT budget_id FROM budgets
      WHERE user_id = ?
        AND category_id = ?
        AND month = ?
      `,
      [userId, categoryId, month],
    );

    if (existingBudget.length > 0) {
      throw new Error("Budget already exists for this category and month");
    }

    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets → Monthly budget records
     *
     * INSERT Operation:
     * - Creates new budget record for user
     * - Links to category and specifies month
     * - Stores budget amount
     */
    const [result] = await db.query(
      `
      INSERT INTO budgets (user_id, category_id, month, amount)
      VALUES (?, ?, ?, ?)
      `,
      [userId, categoryId, month, amount],
    );

    return { budgetId: result.insertId };
  } catch (err) {
    throw err;
  }
};

/**
 * ======================================================
 * ✏️ UPDATE BUDGET SERVICE
 * ======================================================
 * Perform partial updates to an existing budget record.
 */
const updateBudget = async (
  userId,
  budgetId,
  { categoryId, month, amount },
) => {
  try {
    // verify ownership
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets → Monthly budget records
     *
     * WHERE Clause:
     * - budget_id identifies specific budget
     * - user_id ensures ownership permission
     */
    const [existing] = await db.query(
      `SELECT budget_id FROM budgets WHERE budget_id = ? AND user_id = ?`,
      [budgetId, userId],
    );

    if (existing.length === 0) {
      throw new Error("Budget not found");
    }

    // if category change requested, ensure category exists
    if (categoryId !== undefined) {
      /**
       * 📊 SQL Query Explanation
       *
       * Tables Used:
       * - categories → Category definitions and metadata
       *
       * WHERE Clause:
       * - category_id matches requested category
       * - (user_id = ? OR user_id IS NULL) allows user or system categories
       */
      const [category] = await db.query(
        `SELECT category_id FROM categories WHERE category_id = ? AND (user_id = ? OR user_id IS NULL)`,
        [categoryId, userId],
      );

      if (category.length === 0) {
        throw new Error("Category not found");
      }
    }

    // prepare dynamic update
    let updateFields = [];
    let values = [];

    if (categoryId !== undefined) {
      updateFields.push("category_id = ?");
      values.push(categoryId);
    }
    if (month !== undefined) {
      updateFields.push("month = ?");
      values.push(month);
    }
    if (amount !== undefined) {
      updateFields.push("amount = ?");
      values.push(amount);
    }

    if (updateFields.length === 0) {
      // nothing to do
      return true;
    }

    values.push(budgetId, userId);
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets → Monthly budget records
     *
     * UPDATE Operation:
     * - Dynamically updates only provided fields
     * - Supports partial updates (category, month, amount)
     *
     * WHERE Clause:
     * - budget_id targets specific budget
     * - user_id ensures ownership
     */
    const query = `
      UPDATE budgets
      SET ${updateFields.join(", ")}
      WHERE budget_id = ? AND user_id = ?
    `;
    await db.query(query, values);

    return true;
  } catch (err) {
    throw err;
  }
};

/**
 * ======================================================
 * 🗑️ DELETE BUDGET SERVICE
 * ======================================================
 * Removes a budget record after verifying ownership.
 */
const deleteBudget = async (userId, budgetId) => {
  try {
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets → Monthly budget records
     *
     * WHERE Clause:
     * - budget_id identifies specific budget
     * - user_id verifies ownership before deletion
     */
    const [existing] = await db.query(
      `
      SELECT budget_id FROM budgets
      WHERE budget_id = ? AND user_id = ?
      `,
      [budgetId, userId],
    );

    if (existing.length === 0) {
      throw new Error("Budget not found");
    }

    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets → Monthly budget records
     *
     * DELETE Operation:
     * - Permanently removes budget record
     *
     * WHERE Clause:
     * - budget_id targets specific budget
     * - user_id ensures ownership permission
     */
    await db.query(
      `
      DELETE FROM budgets
      WHERE budget_id = ? AND user_id = ?
      `,
      [budgetId, userId],
    );

    return true;
  } catch (err) {
    throw err;
  }
};

/**
 * ======================================================
 * 📊 BUDGET ANALYTICS SERVICE
 * ======================================================
 * Returns detailed analytics for a given month including
 * per-category stats and overall summary.
 */
const getBudgetAnalytics = async (userId, month) => {
  try {
    // run same query as route to fetch raw rows
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - budgets (b)      → Stores monthly budget records
     * - categories (c)   → Category metadata
     * - transactions (t) → Used to calculate spending
     *
     * JOIN categories:
     * - Ensures category details are included
     *
     * LEFT JOIN transactions:
     * - Allows budgets to appear even if no transactions exist
     *
     * DATE_FORMAT:
     * - Filters transactions by same YYYY-MM as budget
     *
     * COALESCE:
     * - Returns 0 if SUM(t.amount) is NULL
     *
     * CAST(... AS DOUBLE):
     * - Ensures numeric values are returned (not strings)
     *
     * GROUP BY:
     * - Explicit columns to satisfy MySQL strict mode
     */
    const [rows] = await db.query(
      `
      SELECT
        b.budget_id,
        b.month,
        CAST(b.amount AS DOUBLE) AS budgetAmount,
        c.category_id,
        c.name AS categoryName,
        CAST(COALESCE(SUM(t.amount), 0) AS DOUBLE) AS spentAmount
      FROM budgets b
      JOIN categories c
        ON b.category_id = c.category_id
      LEFT JOIN transactions t
        ON t.category_id = b.category_id
        AND t.user_id = b.user_id
        AND DATE_FORMAT(t.trn_date, '%Y-%m') = b.month
      WHERE b.user_id = ?
        AND b.month = ?
      GROUP BY b.budget_id, c.category_id, c.name, b.amount, b.month
      `,
      [userId, month],
    );

    // aggregate logic
    let totalBudgetAllocated = 0;
    let totalSpent = 0;
    let overBudgetCategoriesCount = 0;

    const categories = rows.map((row) => {
      const budgetAmount = Number(row.budgetAmount);
      const spentAmount = Number(row.spentAmount);
      const remainingAmount = budgetAmount - spentAmount;
      const percentageUsed =
        budgetAmount > 0
          ? Number(((spentAmount / budgetAmount) * 100).toFixed(2))
          : 0;
      const isOverBudget = spentAmount > budgetAmount;
      const overAmount = isOverBudget
        ? Number((spentAmount - budgetAmount).toFixed(2))
        : 0;

      let status = "Safe";
      if (percentageUsed >= 100) {
        status = "Exceeded";
      } else if (percentageUsed >= 70) {
        status = "Warning";
      }

      if (isOverBudget) overBudgetCategoriesCount++;
      totalBudgetAllocated += budgetAmount;
      totalSpent += spentAmount;

      return {
        budgetId: row.budget_id,
        categoryId: row.category_id,
        categoryName: row.categoryName,
        budgetAmount,
        spentAmount,
        remainingAmount: Number(remainingAmount.toFixed(2)),
        percentageUsed,
        isOverBudget,
        overAmount,
        status,
      };
    });

    const totalRemaining = totalBudgetAllocated - totalSpent;
    const overallPercentageUsed =
      totalBudgetAllocated > 0
        ? Number(((totalSpent / totalBudgetAllocated) * 100).toFixed(2))
        : 0;

    return {
      month,
      summary: {
        totalBudgetAllocated: Number(totalBudgetAllocated.toFixed(2)),
        totalSpent: Number(totalSpent.toFixed(2)),
        totalRemaining: Number(totalRemaining.toFixed(2)),
        overallPercentageUsed,
        overBudgetCategoriesCount,
      },
      categories,
    };
  } catch (err) {
    throw err;
  }
};

module.exports = {
  getBudgets,
  addBudget,
  updateBudget,
  deleteBudget,
  getBudgetAnalytics,
};
