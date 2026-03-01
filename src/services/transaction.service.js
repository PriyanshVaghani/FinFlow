// =======================================
// 📦 Import Required Modules
// =======================================

// 🔎 Builds dynamic SQL WHERE conditions for transaction filtering
const { buildTransactionFilters } = require("./transaction.filters"); 
/**
 * ======================================================
 * 📥 fetchTransactions Utility
 * ======================================================
 *
 * @description
 * Fetches paginated, filtered, and sorted transactions
 * for a specific user including category details
 * and formatted attachments.
 *
 * This service:
 * - Applies dynamic filters (date range, category, type, amount, search)
 * - Applies dynamic sorting (safe column mapping)
 * - Retrieves transaction data from database
 * - Aggregates attachment records into JSON array
 * - Formats attachment paths
 * - Generates absolute attachment URLs using provided baseUrl
 * - Returns total count for pagination
 *
 * @param {Object} db - Database connection instance
 * @param {number|string} userId - Logged-in user ID
 * @param {Object} options - Configuration options
 * @param {number} options.limit - Number of records to fetch
 * @param {number} options.offset - Number of records to skip
 * @param {string} options.baseUrl - Base URL for constructing public file URLs
 * @param {string} options.startDate - Filter start date
 * @param {string} options.endDate - Filter end date
 * @param {Array<number>} options.categoryIds - Filter by category IDs
 * @param {string} options.type - income | expense
 * @param {number} options.minAmount - Minimum amount filter
 * @param {number} options.maxAmount - Maximum amount filter
 * @param {string} options.search - Search keyword
 * @param {string} options.sortBy - Safe DB column for sorting
 * @param {string} options.order - ASC | DESC
 *
 * @returns {Promise<Object>} {
 *   transactions: Array,
 *   total: number
 * }
 */
const fetchTransactions = async (
  db,
  userId,
  {
    limit,
    offset,
    baseUrl,
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
  // Build dynamic WHERE conditions safely.
  // Keeps SQL clean and prevents unsafe string concatenation.
  const { whereClause, params } = buildTransactionFilters({
    startDate,
    endDate,
    categoryIds,
    type,
    minAmount,
    maxAmount,
    search,
  });

  // Fallback defaults ensure predictable sorting behavior
  // even if controller accidentally omits values.
  const finalSortBy = sortBy ?? "t.trn_date";
  const finalOrder = order ?? "DESC";

  /**
   * SQL Query Overview
   *
   * Purpose:
   * Retrieves user transactions with category details and
   * aggregates optional attachments into a structured JSON array.
   *
   * Tables Involved:
   * - transactions (t)
   *     Primary source of transaction records.
   *     Filtered by user_id to enforce data isolation per user.
   *
   * - categories (c)
   *     Provides category name and type (income/expense).
   *     INNER JOIN is used because every transaction must belong to a category.
   *
   * - transaction_attachments (ta)
   *     Stores optional file attachments linked to transactions.
   *     LEFT JOIN is used because a transaction may not have attachments.
   *
   * Attachment Aggregation Strategy:
   * - JSON_ARRAYAGG groups multiple attachment rows into a single JSON array.
   * - JSON_OBJECT structures each attachment with defined properties.
   * - CASE ensures NULL attachment rows are excluded.
   * - COALESCE guarantees an empty JSON array instead of NULL,
   *   keeping API response shape consistent.
   *
   * GROUP BY t.trn_id:
   * Required because JSON aggregation converts multiple attachment rows
   * into one row per transaction. Prevents duplicate transaction records.
   *
   * Sorting:
   * ORDER BY uses pre-validated column mapping (from service layer).
   * This prevents SQL injection in dynamic ORDER BY clauses.
   *
   * Pagination:
   * LIMIT controls page size.
   * OFFSET skips previously fetched records.
   * Enables efficient server-side pagination.
   */
  let query = `
    SELECT 
      t.trn_id AS trnId,
      CAST(t.amount AS DOUBLE) AS amount,
      t.note,
      t.trn_date AS trnDate,
      c.category_id AS categoryId,
      c.name AS categoryName,
      c.type,
      COALESCE(
        JSON_ARRAYAGG(
          CASE 
            WHEN ta.attachment_id IS NOT NULL THEN JSON_OBJECT(
              'id', ta.attachment_id,
              'fileName', ta.file_name,
              'filePath', ta.file_path,
              'fileType', ta.file_type,
              'fileSize', ta.file_size
            )
          END
        ),
        JSON_ARRAY()
      ) AS attachments
    FROM transactions t
    LEFT JOIN transaction_attachments ta 
      ON ta.trn_id = t.trn_id
    JOIN categories c 
      ON c.category_id = t.category_id
    WHERE t.user_id = ?
    ${whereClause}
    GROUP BY t.trn_id
    ORDER BY ${finalSortBy} ${finalOrder}
    LIMIT ? OFFSET ?
  `;

  // Parameterized query prevents SQL injection.
  // Order: userId first (base filter), then dynamic filters, then pagination.
  const finalParams = [userId, ...params, limit, offset];

  const [rows] = await db.query(query, finalParams);

  /**
   * Post-process attachments
   *
   * Responsibilities:
   * - Remove NULL attachment objects caused by LEFT JOIN
   * - Normalize file paths (Windows "\" → URL-friendly "/")
   * - Generate absolute public URL using provided baseUrl
   *
   * Note:
   * - baseUrl is passed from controller layer
   * - Keeps request-specific logic outside SQL
   */
  const transactions = rows.map((trn) => {
    // Ensure attachments is a valid array
    const attachments = Array.isArray(trn.attachments)
      ? trn.attachments
          // Remove null entries caused by CASE condition inside JSON_ARRAYAGG.
          // Prevents frontend from receiving invalid attachment objects.
          .filter((a) => a && a.filePath)
          .map((a) => {
            // Normalize Windows file paths to URL-safe format.
            // Browsers expect forward slashes.
            const cleanPath = a.filePath.replace(/\\/g, "/");

            return {
              ...a,
              filePath: cleanPath,

              // Construct absolute public URL dynamically.
              // Keeps domain logic outside database layer.
              url: `${baseUrl}/${cleanPath}`,
            };
          })
      : [];

    return {
      ...trn,
      attachments,
    };
  });

  // Count query required for pagination metadata.
  // DISTINCT ensures correct counting when JOINs exist.
  let countQuery = `
    SELECT COUNT(DISTINCT t.trn_id) AS total
    FROM transactions t
    JOIN categories c ON t.category_id = c.category_id
    WHERE t.user_id = ?
    ${whereClause}
  `;

  const [countResult] = await db.query(countQuery, [userId, ...params]);

  return {
    transactions,
    total: countResult[0].total,
  };
};

// =======================================
// 📤 Export Module
// =======================================

module.exports = { fetchTransactions }; // 🚀 Exposes transaction service for controller layer usage