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
 * 📥 GET /budgets
 * ======================================================
 * @route   GET /budgets?month=YYYY-MM
 * @desc    Fetch budgets for a specific month along with
 *          calculated spent amount per category
 * @access  Private (JWT protected)
 *
 * Query Params:
 * - month (required) → Format: YYYY-MM (Example: 2026-02)
 *
 * Responsibilities:
 * - Validate month input
 * - Fetch budgets belonging to logged-in user
 * - Calculate total spent amount per category
 * - Return structured response
 */
router.get("/", authenticationToken, async (req, res) => {
  // 📥 Extract month from query string
  const { month } = req.query;

  // 👤 Logged-in user ID (provided by authentication middleware)
  const userId = req.userId;

  // ❗ Ensure month is provided
  if (!month) {
    return sendError(res, {
      statusCode: 422,
      message: "month is required",
    });
  }

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

    // ✅ Return formatted success response
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  } catch (err) {
    // ❌ Handle unexpected database errors
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * ➕ POST /budgets/add
 * ======================================================
 * @route   POST /budgets/add
 * @desc    Create a new monthly budget
 * @access  Private (JWT protected)
 *
 * Body:
 * - categoryId (required)
 * - month (YYYY-MM format, required)
 * - amount (positive number, required)
 *
 * Responsibilities:
 * - Validate inputs
 * - Ensure category is valid Expense type
 * - Prevent duplicate budgets
 * - Insert new budget record
 */
router.post("/add", authenticationToken, async (req, res) => {
  const { categoryId, month, amount } = req.body;
  const userId = req.userId; // 👤 From JWT

  // 1️⃣ Basic field validation
  if (!categoryId || !month || amount == null) {
    return sendError(res, {
      statusCode: 422,
      message: "categoryId, month and amount are required",
    });
  }

  // 2️⃣ Ensure budget amount is positive
  if (amount <= 0) {
    return sendError(res, {
      statusCode: 422,
      message: "Budget amount must be greater than 0",
    });
  }

  // 3️⃣ Validate month format
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!monthRegex.test(month)) {
    return sendError(res, {
      statusCode: 422,
      message: "Month must be in YYYY-MM format",
    });
  }

  try {
    // 4️⃣ Validate category:
    // - Must be Expense type
    // - Must be active
    // - Must belong to user OR be global (user_id IS NULL)
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
      return sendError(res, {
        statusCode: 404,
        message: "Invalid expense category",
      });
    }

    // 5️⃣ Prevent duplicate budget for same month & category
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
      return sendError(res, {
        statusCode: 409,
        message: "Budget already exists for this category and month",
      });
    }

    // 6️⃣ Insert new budget record
    const [result] = await db.query(
      `
      INSERT INTO budgets (user_id, category_id, month, amount)
      VALUES (?, ?, ?, ?)
      `,
      [userId, categoryId, month, amount],
    );

    return sendSuccess(res, {
      statusCode: 201,
      message: "Budget created successfully",
      data: {
        budgetId: result.insertId,
      },
    });
  } catch (err) {
    // Handle unique constraint error (DB-level protection)
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, {
        statusCode: 409,
        message: "Budget already exists for this category and month",
      });
    }

    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * ✏️ PUT /budgets/update
 * ======================================================
 * @route   PUT /budgets/update?budgetId=ID
 * @desc    Update an existing budget (Partial update supported)
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Validate budget ownership
 * - Allow partial updates
 * - Dynamically construct update query
 */
router.put("/update", authenticationToken, async (req, res) => {
  const { budgetId } = req.query;
  const userId = req.userId;
  const { categoryId, month, amount } = req.body;

  // Validate budgetId presence
  if (!budgetId) {
    return sendError(res, {
      statusCode: 422,
      message: "BudgetId is required",
    });
  }

  // Ensure at least one field is provided
  if (categoryId === undefined && month === undefined && amount === undefined) {
    return sendError(res, {
      statusCode: 422,
      message: "At least one field is required to update",
    });
  }

  // Validate amount if provided
  if (amount !== undefined && Number(amount) <= 0) {
    return sendError(res, {
      statusCode: 422,
      message: "Amount must be a positive number",
    });
  }

  // Validate month format if provided
  if (month !== undefined) {
    const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    if (!monthRegex.test(month)) {
      return sendError(res, {
        statusCode: 422,
        message: "Month must be in YYYY-MM format",
      });
    }
  }

  try {
    // Verify budget exists and belongs to logged-in user
    const [existing] = await db.query(
      `SELECT budget_id FROM budgets WHERE budget_id = ? AND user_id = ?`,
      [budgetId, userId],
    );

    if (existing.length === 0) {
      return sendError(res, {
        statusCode: 404,
        message: "Budget not found",
      });
    }

    // If category is being updated → verify it exists
    if (categoryId !== undefined) {
      const [category] = await db.query(
        `SELECT category_id FROM categories WHERE category_id = ? AND (user_id = ? OR user_id IS NULL)`,
        [categoryId, userId],
      );

      if (category.length === 0) {
        return sendError(res, {
          statusCode: 404,
          message: "Category not found",
        });
      }
    }

    // 🔄 Dynamic SQL construction for partial update
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

    values.push(budgetId, userId);

    const query = `
      UPDATE budgets
      SET ${updateFields.join(", ")}
      WHERE budget_id = ? AND user_id = ?
    `;

    await db.query(query, values);

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget updated successfully",
    });
  } catch (err) {
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * 🗑️ DELETE /budgets/delete
 * ======================================================
 * @route   DELETE /budgets/delete?budgetId=ID
 * @desc    Delete a budget record
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Verify budget ownership
 * - Safely delete record
 */
router.delete("/delete", authenticationToken, async (req, res) => {
  const { budgetId } = req.query;
  const userId = req.userId;

  try {
    // Ensure budget belongs to logged-in user
    const [existing] = await db.query(
      `
      SELECT budget_id FROM budgets
      WHERE budget_id = ? AND user_id = ?
      `,
      [budgetId, userId],
    );

    if (existing.length === 0) {
      return sendError(res, {
        statusCode: 404,
        message: "Budget not found",
      });
    }

    // Delete record
    await db.query(
      `
      DELETE FROM budgets
      WHERE budget_id = ? AND user_id = ?
      `,
      [budgetId, userId],
    );

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget deleted successfully",
    });
  } catch (err) {
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

// =======================================
// 📦 Export Router
// =======================================
module.exports = router;
