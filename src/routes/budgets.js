// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
const asyncHandler = require("../utils/asyncHandler"); // 🔁 Handles async errors (removes try-catch)

// ✅ Budget request validators
const {
  validateGetBudgets,
  validateAddBudget,
  validateUpdateBudget,
  validateDeleteBudget,
  validateBudgetAnalytics,
} = require("../validators/budgets.validator");

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
 * - Validate month input (handled by validator middleware)
 * - Fetch budgets belonging to the logged-in user
 * - Calculate total spent amount per category
 * - Return structured response
 */
router.get(
  "/",
  authenticationToken,
  validateGetBudgets,
  asyncHandler(async (req, res) => {
    // 📥 Extract month from query string
    const { month } = req.query;

    // 👤 Logged-in user ID (provided by authentication middleware)
    const userId = req.userId;

    // 📂 Fetch budgets via service
    const rows = await getBudgets(userId, month);

    // 📤 Return formatted success response
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  }),
);

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
 * - Validate inputs (handled by validator middleware)
 * - Ensure category is a valid Expense type
 * - Prevent duplicate budgets
 * - Insert new budget record
 */
router.post(
  "/add",
  authenticationToken,
  validateAddBudget,
  asyncHandler(async (req, res) => {
    const { categoryId, month, amount } = req.body;
    const userId = req.userId; // 👤 Extracted from JWT

    // 📂 Add budget via service
    const data = await addBudget(userId, categoryId, month, amount);

    return sendSuccess(res, {
      statusCode: 201,
      message: "Budget created successfully",
      data,
    });
  }),
);

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
router.put(
  "/update",
  authenticationToken,
  validateUpdateBudget,
  asyncHandler(async (req, res) => {
    const { budgetId } = req.query;
    const userId = req.userId;
    const { categoryId, month, amount } = req.body;

    // 📂 Update budget via service
    await updateBudget(userId, budgetId, { categoryId, month, amount });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget updated successfully",
    });
  }),
);

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
router.delete(
  "/delete",
  authenticationToken,
  validateDeleteBudget,
  asyncHandler(async (req, res) => {
    const { budgetId } = req.query;
    const userId = req.userId;

    // 📂 Delete budget via service
    await deleteBudget(userId, budgetId);

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget deleted successfully",
    });
  }),
);

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
router.get(
  "/analytics",
  authenticationToken,
  validateBudgetAnalytics,
  asyncHandler(async (req, res) => {
    // 📥 Extract month from query params
    const { month } = req.query;

    // 👤 Logged-in user ID (provided by JWT middleware)
    const userId = req.userId;

    const data = await getBudgetAnalytics(userId, month);

    return sendSuccess(res, {
      statusCode: 200,
      data,
    });
  }),
);

// =======================================
// 📦 Export Router
// =======================================
module.exports = router;
