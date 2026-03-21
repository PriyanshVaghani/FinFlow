// =======================================
// 📦 Import Required Utilities
// =======================================
const { isValidMonth } = require("../utils/validation"); // 📅 Month format validator

/**
 * ======================================================
 * 📥 Validate Get Budgets Request
 * ======================================================
 * Ensures month query parameter exists and follows YYYY-MM format
 */
const validateGetBudgets = (req, res, next) => {
  const { month } = req.query;

  // 🔎 Validate month presence
  if (!month) {
    return next({
      statusCode: 422,
      message: "Month is required to fetch budgets",
    });
  }

  // 🔎 Validate month format
  if (!isValidMonth(month)) {
    return next({
      statusCode: 422,
      message: "Month must be in YYYY-MM format",
    });
  }

  next();
};

/**
 * ======================================================
 * ➕ Validate Add Budget Request
 * ======================================================
 * Ensures required fields are present and valid
 */
const validateAddBudget = (req, res, next) => {
  const { categoryId, month, amount } = req.body;

  // 🔎 Validate categoryId
  if (!categoryId) {
    return next({
      statusCode: 422,
      message: "Category ID is required",
    });
  }

  // 🔎 Validate month
  if (!month) {
    return next({
      statusCode: 422,
      message: "Month is required to create a budget",
    });
  }

  // 🔎 Validate month format
  if (!isValidMonth(month)) {
    return next({
      statusCode: 422,
      message: "Month must be in YYYY-MM format",
    });
  }

  // 🔎 Validate amount presence
  if (amount === undefined || amount === null) {
    return next({
      statusCode: 422,
      message: "Budget amount is required",
    });
  }

  // 🔎 Validate positive amount
  if (Number(amount) <= 0) {
    return next({
      statusCode: 422,
      message: "Budget amount must be greater than 0",
    });
  }

  next();
};

/**
 * ======================================================
 * ✏️ Validate Update Budget Request
 * ======================================================
 * Ensures budgetId exists and valid fields are provided
 */
const validateUpdateBudget = (req, res, next) => {
  const { budgetId } = req.query;
  const { categoryId, month, amount } = req.body;

  // 🔎 Validate budgetId
  if (!budgetId) {
    return next({
      statusCode: 422,
      message: "Budget ID is required",
    });
  }

  // 🔎 Ensure at least one field exists
  if (categoryId === undefined && month === undefined && amount === undefined) {
    return next({
      statusCode: 422,
      message: "At least one field must be provided to update the budget",
    });
  }

  // 🔎 Validate month format if provided
  if (month !== undefined && !isValidMonth(month)) {
    return next({
      statusCode: 422,
      message: "Month must be in YYYY-MM format",
    });
  }

  // 🔎 Validate amount if provided
  if (amount !== undefined && Number(amount) <= 0) {
    return next({
      statusCode: 422,
      message: "Budget amount must be greater than 0",
    });
  }

  next();
};

/**
 * ======================================================
 * 🗑️ Validate Delete Budget Request
 * ======================================================
 * Ensures budgetId query parameter exists
 */
const validateDeleteBudget = (req, res, next) => {
  const { budgetId } = req.query;

  // 🔎 Validate budgetId
  if (!budgetId) {
    return next({
      statusCode: 422,
      message: "Budget ID is required",
    });
  }

  next();
};

/**
 * ======================================================
 * 📊 Validate Budget Analytics Request
 * ======================================================
 * Ensures month query parameter exists and valid
 */
const validateBudgetAnalytics = (req, res, next) => {
  const { month } = req.query;

  // 🔎 Validate month presence
  if (!month) {
    return next({
      statusCode: 422,
      message: "Month is required to view budget analytics",
    });
  }

  // 🔎 Validate month format
  if (!isValidMonth(month)) {
    return next({
      statusCode: 422,
      message: "Month must be in YYYY-MM format",
    });
  }

  next();
};

// =======================================
// 📤 Export Validators
// =======================================
module.exports = {
  validateGetBudgets,
  validateAddBudget,
  validateUpdateBudget,
  validateDeleteBudget,
  validateBudgetAnalytics,
};
