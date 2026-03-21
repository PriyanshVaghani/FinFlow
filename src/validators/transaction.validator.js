// =======================================
// 📦 Import Required Utilities
// =======================================
const { isValidISODate } = require("../utils/validation"); // 📅 ISO date validator

/**
 * ======================================================
 * 📥 Validate Add Transaction Request
 * ======================================================
 * Ensures required transaction fields exist
 */
const validateAddTransaction = (req, res, next) => {
  const { categoryId, amount, trnDate } = req.body;

  // 🔎 Validate categoryId
  if (!categoryId) {
    return next({
      statusCode: 422,
      message: "Category ID is required",
    });
  }

  // 🔎 Validate amount
  if (!amount) {
    return next({
      statusCode: 422,
      message: "Transaction amount is required",
    });
  }

  // 🔎 Validate transaction date
  if (!trnDate) {
    return next({
      statusCode: 422,
      message: "Transaction date is required",
    });
  }

  // 🔎 Validate date format
  if (!isValidISODate(trnDate)) {
    return next({
      statusCode: 400,
      message: "Transaction date must be in YYYY-MM-DD format",
    });
  }

  next();
};

/**
 * ======================================================
 * ✏️ Validate Update Transaction Request
 * ======================================================
 * Ensures trnId exists and at least one field to update
 */
const validateUpdateTransaction = (req, res, next) => {
  const { trnId } = req.query;
  const { categoryId, amount, note, trnDate } = req.body;

  if (!trnId) {
    return next({
      statusCode: 422,
      message: "Transaction ID is required",
    });
  }

  if (
    categoryId === undefined &&
    amount === undefined &&
    note === undefined &&
    trnDate === undefined &&
    !(req.files && req.files.length)
  ) {
    return next({
      statusCode: 422,
      message: "At least one field must be provided to update the transaction",
    });
  }

  if (trnDate && !isValidISODate(trnDate)) {
    return next({
      statusCode: 400,
      message: "Transaction date must be in YYYY-MM-DD format",
    });
  }

  next();
};

/**
 * ======================================================
 * 🗑️ Validate Delete Transaction Request
 * ======================================================
 */
const validateDeleteTransaction = (req, res, next) => {
  const { trnId } = req.query;

  if (!trnId) {
    return next({
      statusCode: 422,
      message: "Transaction ID is required",
    });
  }

  next();
};

/**
 * ======================================================
 * 🔁 Validate Add Recurring Transaction
 * ======================================================
 */
const validateAddRecurringTransaction = (req, res, next) => {
  const { categoryId, amount, frequency, startDate } = req.body;

  if (!categoryId) {
    return next({
      statusCode: 422,
      message: "Category ID is required",
    });
  }

  if (!amount) {
    return next({
      statusCode: 422,
      message: "Transaction amount is required",
    });
  }

  if (!frequency) {
    return next({
      statusCode: 422,
      message: "Recurring frequency is required",
    });
  }

  if (!startDate) {
    return next({
      statusCode: 422,
      message: "Start date is required",
    });
  }

  if (!isValidISODate(startDate)) {
    return next({
      statusCode: 400,
      message: "Start date must be in YYYY-MM-DD format",
    });
  }

  next();
};

/**
 * ======================================================
 * 🔁 Validate Update Recurring Transaction
 * ======================================================
 */
const validateUpdateRecurringTransaction = (req, res, next) => {
  const { recurringId } = req.query;

  if (!recurringId) {
    return next({
      statusCode: 422,
      message: "Recurring transaction ID is required",
    });
  }

  next();
};

// =======================================
// 📤 Export Validators
// =======================================
module.exports = {
  validateAddTransaction,
  validateUpdateTransaction,
  validateDeleteTransaction,
  validateAddRecurringTransaction,
  validateUpdateRecurringTransaction,
};
