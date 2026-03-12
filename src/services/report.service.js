// =======================================
// 📦 Import Modules
// =======================================
const db = require("../config/db");

// 📄 Library used to convert JSON data into CSV format for export
const { Parser } = require("json2csv");

// 🧠 Utility that dynamically builds SQL WHERE conditions based on filters
// Logical reason: keeps filter logic reusable across transaction APIs and reports
const { buildTransactionFilters } = require("../utils/transaction.filters");

/**
 * =======================================
 * 📤 Export Transactions
 * =======================================
 * - Reuses filter builder
 * - No pagination
 * - No attachments
 * - Optimized for export
 *
 * Logical Flow:
 * 1️⃣ Build dynamic filters
 * 2️⃣ Execute SQL query
 * 3️⃣ Convert result to CSV
 * 4️⃣ Return CSV string
 */
const exportTransactions = async (
  userId,
  {
    startDate,
    endDate,
    categoryIds,
    type,
    minAmount,
    maxAmount,
    search,
    sortBy,
    order,
  },
) => {

  // Build WHERE conditions dynamically
  // Logical reason:
  // - Allows flexible filtering without writing multiple queries
  // - Prevents SQL injection by using parameterized values
  const { whereClause, params } = buildTransactionFilters({
    startDate,
    endDate,
    categoryIds,
    type,
    minAmount,
    maxAmount,
    search,
  });

  // Default sorting if client does not provide sorting options
  // Logical reason:
  // - Ensures consistent export ordering
  // - Transactions typically sorted by latest date first
  const finalSortBy = sortBy ?? "t.trn_date";
  const finalOrder = order ?? "DESC";

  const query = `
    SELECT
      t.trn_id AS trnId,
      t.trn_date AS trnDate,
      c.name AS categoryName,
      c.type,
      CAST(t.amount AS DOUBLE) AS amount,
      t.note
    FROM transactions t
    JOIN categories c
      ON c.category_id = t.category_id
    WHERE t.user_id = ?
    ${whereClause}
    ORDER BY ${finalSortBy} ${finalOrder}
  `;

  // Execute query
  // Logical reason:
  // - userId ensures user only exports their own transactions
  // - spread operator merges dynamic filter params
  const [rows] = await db.query(query, [userId, ...params]);

  // Convert query result JSON → CSV
  const parser = new Parser({
    // Logical reason:
    // - Controls CSV column order
    // - Excludes internal fields like trnId
    fields: ["trnDate", "categoryName", "type", "amount", "note"],
  });

  // Returns CSV string
  return parser.parse(rows);
};

// 🚀 Export service so it can be used by report controller routes
module.exports = {
  exportTransactions,
};
