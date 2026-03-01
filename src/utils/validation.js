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

// =======================================
// 📤 Export Module
// =======================================

module.exports = { isValidISODate }; // 🚀 Exposes ISO date validation utility for controller-level input validation