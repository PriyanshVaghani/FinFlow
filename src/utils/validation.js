/**
 * Validates whether a string is a valid ISO date in YYYY-MM-DD format.
 *
 * Why this is needed:
 * - Prevents invalid date values from reaching database queries
 * - Avoids runtime errors caused by malformed dates
 * - Ensures consistent filtering behavior in APIs
 *
 * Note:
 * - This validates format and basic date validity
 * - Does not enforce business rules (e.g., future dates allowed or not)
 */
const isValidISODate = (dateStr) => {

  // Reject empty, null, or undefined values early.
  // Keeps calling code logic predictable.
  if (!dateStr) return false;

  // Strict format check (YYYY-MM-DD).
  // Prevents partial formats like YYYY-M-D or random strings.
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoRegex.test(dateStr)) return false;

  // Create Date object to verify actual calendar validity.
  // Example: 2024-02-30 passes regex but is not a real date.
  const date = new Date(dateStr);

  // getTime() returns NaN for invalid dates.
  // Ensures final validation beyond regex pattern.
  return !isNaN(date.getTime());
};

/**
 * ======================================================
 * 📅 Validate Month Format (YYYY-MM)
 * ======================================================
 * Ensures month follows correct format and valid range
 *
 * Regex explanation:
 * ^\d{4}        → 4-digit year
 * -
 * (0[1-9]|1[0-2]) → Month from 01 to 12
 */
const isValidMonth = (month) => {
  const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
  return monthRegex.test(month);
};

/**
 * ======================================================
 * 📂 Parse categoryIds from query params
 * ======================================================
 * Normalizes Express query values into a numeric ID array.
 *
 * Supported:
 * - missing / empty → []
 * - single: ?categoryIds=1 → [1]
 * - multiple: ?categoryIds=1&categoryIds=2 → [1, 2]
 *
 * Not supported:
 * - comma-separated strings (e.g. "1,2,3") — those are dropped
 *
 * Non-numeric values are filtered out for safety.
 *
 * @param {string|string[]|undefined} rawCategoryIds - req.query.categoryIds
 * @returns {number[]}
 */
const parseCategoryIds = (rawCategoryIds) => {
  if (!rawCategoryIds) {
    return [];
  }

  const values = Array.isArray(rawCategoryIds)
    ? rawCategoryIds
    : [rawCategoryIds];

  return values.filter((id) => /^\d+$/.test(id)).map(Number);
};

// =======================================
// 📤 Export Module
// =======================================

module.exports = { isValidISODate, isValidMonth, parseCategoryIds };
