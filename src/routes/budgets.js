// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
const { isValidMonth } = require("../utils/validation");
const {
  getBudgets,
  addBudget,
  updateBudget,
  deleteBudget,
  getBudgetAnalytics,
} = require("../services/budgets.service"); // 📂 Budget services

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
router.get("/", authenticationToken, async (req, res, next) => {
  try {
    // 📥 Extract month from query string
    const { month } = req.query;

    // 👤 Logged-in user ID (provided by authentication middleware)
    const userId = req.userId;

    // ❗ Ensure month is provided
    if (!month) {
      return next({
        statusCode: 422,
        message: "month is required",
      });
    }

    // Validate month format if provided
    if (month !== undefined && !isValidMonth(month)) {
      return next({
        statusCode: 422,
        message: "Month must be in YYYY-MM format",
      });
    }

    // 2️⃣ Fetch budgets via service
    const rows = await getBudgets(userId, month);

    // ✅ Return formatted success response
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  } catch (err) {
    next(err); // pass error to global handler
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
router.post("/add", authenticationToken, async (req, res, next) => {
  try {
    const { categoryId, month, amount } = req.body;
    const userId = req.userId; // 👤 From JWT

    // Basic field validation
    if (!categoryId || !month || amount == null) {
      return next({
        statusCode: 422,
        message: "categoryId, month and amount are required",
      });
    }

    // Ensure budget amount is positive
    if (amount <= 0) {
      return next({
        statusCode: 422,
        message: "Budget amount must be greater than 0",
      });
    }

    // Validate month format if provided
    if (month !== undefined && !isValidMonth(month)) {
      return next({
        statusCode: 422,
        message: "Month must be in YYYY-MM format",
      });
    }

    // Add budget via service
    const data = await addBudget(userId, categoryId, month, amount);

    return sendSuccess(res, {
      statusCode: 201,
      message: "Budget created successfully",
      data,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next({
        statusCode: 409,
        message: "Budget already exists for this category and month",
      });
    }

    next(err);
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
router.put("/update", authenticationToken, async (req, res, next) => {
  try {
    const { budgetId } = req.query;
    const userId = req.userId;
    const { categoryId, month, amount } = req.body;

    // Validate budgetId presence
    if (!budgetId) {
      return next({
        statusCode: 422,
        message: "BudgetId is required",
      });
    }

    // Ensure at least one field is provided
    if (
      categoryId === undefined &&
      month === undefined &&
      amount === undefined
    ) {
      return next({
        statusCode: 422,
        message: "At least one field is required to update",
      });
    }

    // Validate amount if provided
    if (amount !== undefined && Number(amount) <= 0) {
      return next({
        statusCode: 422,
        message: "Amount must be a positive number",
      });
    }
    // Validate month format if provided
    if (month !== undefined && !isValidMonth(month)) {
      return next({
        statusCode: 422,
        message: "Month must be in YYYY-MM format",
      });
    }

    // Update via service
    await updateBudget(userId, budgetId, { categoryId, month, amount });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget updated successfully",
    });
  } catch (err) {
    next(err);
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
router.delete("/delete", authenticationToken, async (req, res, next) => {
  try {
    const { budgetId } = req.query;

    const userId = req.userId;

    // Delete via service
    await deleteBudget(userId, budgetId);

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

/**
 * ======================================================
 * 📊 GET /analytics
 * ======================================================
 * @route   GET /analytics
 * @desc    Fetch monthly budget analytics for a specific month
 * @access  Private
 *
 * Query Params:
 * - month (required) → Format: YYYY-MM
 *
 * Responsibilities:
 * - Validate month format
 * - Fetch budget vs spending per category
 * - Calculate totals and percentages
 * - Identify over-budget categories
 * - Return structured analytics response
 */
router.get("/analytics", authenticationToken, async (req, res, next) => {
  try {
    // Extract month from query params
    const { month } = req.query;

    // Logged-in user ID (from JWT middleware)
    const userId = req.userId;

    // 🛑 Validation: Month Required
    if (!month) {
      return next({
        statusCode: 422,
        message: "month is required",
      });
    }

    // Validate month format if provided
    if (month !== undefined && !isValidMonth(month)) {
      return next({
        statusCode: 422,
        message: "Month must be in YYYY-MM format",
      });
    }

    const data = await getBudgetAnalytics(userId, month);
    return sendSuccess(res, {
      statusCode: 200,
      data,
    });
  } catch (err) {
    // ❌ Error Handling
    next(err);
  }
});

// =======================================
// 📦 Export Router
// =======================================
module.exports = router;
