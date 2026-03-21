// =======================================
// 📦 Dashboard Request Validators
// =======================================

/**
 * ======================================================
 * 📊 Validate Monthly Summary Query
 * ======================================================
 */
const validateMonthlySummary = (req, res, next) => {
  const { month, year } = req.query;

  // Validate month number
  if (month && isNaN(month)) {
    return next({
      statusCode: 422,
      message: "Month must be a valid number",
    });
  }

  // Validate month range
  if (month && (Number(month) < 1 || Number(month) > 12)) {
    return next({
      statusCode: 422,
      message: "Month must be between 1 and 12 (January–December)",
    });
  }

  // Validate year
  if (year && isNaN(year)) {
    return next({
      statusCode: 422,
      message: "Year must be a valid number",
    });
  }

  next();
};

/**
 * ======================================================
 * 📊 Validate Category Summary Query
 * ======================================================
 */
const validateCategorySummary = (req, res, next) => {
  const { month, year } = req.query;

  if (month && isNaN(month)) {
    return next({
      statusCode: 422,
      message: "Month must be a valid number",
    });
  }

  if (month && (Number(month) < 1 || Number(month) > 12)) {
    return next({
      statusCode: 422,
      message: "Month must be between 1 and 12 (January–December)",
    });
  }

  if (year && isNaN(year)) {
    return next({
      statusCode: 422,
      message: "Year must be a valid number",
    });
  }

  next();
};

/**
 * ======================================================
 * 📈 Validate Monthly Trend Query
 * ======================================================
 */
const validateMonthlyTrend = (req, res, next) => {
  const { year } = req.query;

  if (year && isNaN(year)) {
    return next({
      statusCode: 422,
      message: "Year must be a valid number",
    });
  }

  next();
};

/**
 * ======================================================
 * 📊 Validate Month Comparison Query
 * ======================================================
 */
const validateMonthComparison = (req, res, next) => {
  const { month, year } = req.query;

  if (month && isNaN(month)) {
    return next({
      statusCode: 422,
      message: "Month must be a valid number",
    });
  }

  if (month && (Number(month) < 1 || Number(month) > 12)) {
    return next({
      statusCode: 422,
      message: "Month must be between 1 and 12 (January–December)",
    });
  }

  if (year && isNaN(year)) {
    return next({
      statusCode: 422,
      message: "Year must be a valid number",
    });
  }

  next();
};

/**
 * ======================================================
 * 📥 Validate Recent Transactions Query
 * ======================================================
 */
const validateRecentTransactions = (req, res, next) => {
  const { take } = req.query;

  if (take && isNaN(take)) {
    return next({
      statusCode: 422,
      message: "Take parameter must be a valid number",
    });
  }

  if (take && Number(take) > 50) {
    return next({
      statusCode: 422,
      message: "Take parameter cannot exceed 50 records",
    });
  }

  next();
};

// =======================================
// 📤 Export Validators
// =======================================
module.exports = {
  validateMonthlySummary,
  validateCategorySummary,
  validateMonthlyTrend,
  validateMonthComparison,
  validateRecentTransactions,
};
