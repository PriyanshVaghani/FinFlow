/**
 * ======================================================
 * 🔎 buildTransactionFilters Utility
 * ======================================================
 *
 * Dynamically builds SQL WHERE conditions
 * based on provided filter inputs.
 *
 * Supported Filters:
 * - Date range (startDate, endDate)
 * - Category IDs (IN clause)
 * - Transaction type (income/expense)
 * - Amount range (minAmount, maxAmount)
 * - Search (matches note or category name)
 *
 * Returns:
 * - whereClause → Safe SQL condition string
 * - params → Parameter array for prepared statements
 *
 * Security:
 * - Uses parameter binding to prevent SQL injection
 */
const buildTransactionFilters = (filters) => {
  const {
    startDate,
    endDate,
    categoryIds,
    type,
    minAmount,
    maxAmount,
    search,
  } = filters;

  // conditions → stores individual SQL conditions
  // params → stores bound values matching each placeholder (?)
  const conditions = [];
  const params = [];

  // Date filtering uses >= and <= to allow inclusive ranges.
  // Keeps filtering logic consistent with typical reporting expectations.
  if (startDate) {
    conditions.push("t.trn_date >= ?");
    params.push(startDate);
  }

  if (endDate) {
    conditions.push("t.trn_date <= ?");
    params.push(endDate);
  }

  // Category filter uses IN clause for multi-select support.
  // Dynamic placeholders ensure proper parameter binding.
  if (categoryIds?.length > 0) {
    const placeholders = categoryIds.map(() => "?").join(",");
    conditions.push(`t.category_id IN (${placeholders})`);

    // Spread ensures each category ID matches its placeholder.
    params.push(...categoryIds);
  }

  // Filter by transaction type (income/expense).
  // Uses exact match because type is controlled enum value.
  if (type) {
    conditions.push("c.type = ?");
    params.push(type);
  }

  // Amount filters are separated to allow independent usage
  // (e.g., only minAmount or only maxAmount).
  if (minAmount !== undefined) {
    conditions.push("t.amount >= ?");
    params.push(minAmount);
  }

  if (maxAmount !== undefined) {
    conditions.push("t.amount <= ?");
    params.push(maxAmount);
  }

  // Search filter applies to both transaction note and category name.
  // Uses LIKE with wildcard pattern for partial matching.
  // Parameter binding prevents injection even with user-provided search text.
  if (search) {
    conditions.push("(t.note LIKE ? OR c.name LIKE ?)");

    // Wrap search term with % for substring matching.
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern);
  }

  // If conditions exist, prepend "AND" because base query already has:
  // WHERE t.user_id = ?
  // This keeps filter builder independent from main query structure.
  const whereClause = conditions.length
    ? " AND " + conditions.join(" AND ")
    : "";

  return {
    whereClause,
    // Ensures params is always an array (defensive programming).
    params: Array.isArray(params) ? params : [],
  };
};

// =======================================
// 📤 Export Module
// =======================================

module.exports = { buildTransactionFilters }; // 🚀 Exposes filter builder utility for service layer usage