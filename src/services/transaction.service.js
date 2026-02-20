/**
 * ======================================================
 * 📥 fetchTransactions Utility
 * ======================================================
 *
 * @description
 * Fetches paginated transactions for a specific user,
 * including category details and formatted attachments.
 *
 * This service:
 * - Retrieves transaction data from database
 * - Aggregates attachment records into JSON array
 * - Formats attachment paths
 * - Generates absolute attachment URLs using provided baseUrl
 *
 * @param {Object} db - Database connection instance
 * @param {number|string} userId - Logged-in user ID
 * @param {Object} options - Configuration options
 * @param {number} options.limit - Number of records to fetch
 * @param {number} options.offset - Number of records to skip
 * @param {string} options.baseUrl - Base URL for constructing public file URLs
 *
 * @returns {Promise<Array>} List of transactions with:
 * - Basic transaction info
 * - Category details
 * - Attachments (cleaned + absolute URL included)
 */
const fetchTransactions = async (db, userId, { limit, offset, baseUrl }) => {
  /**
   * 📊 SQL Query Explanation
   *
   * Tables:
   * - transactions (t)              → Main transaction records
   * - categories (c)                → Category name & type (Income/Expense)
   * - transaction_attachments (ta)  → Optional file attachments
   *
   * JOIN Strategy:
   * - JOIN categories → Required (every transaction must have a category)
   * - LEFT JOIN attachments → Optional (transaction may have zero files)
   *
   * JSON Handling:
   * - JSON_ARRAYAGG → Combines multiple attachment rows into one JSON array
   * - JSON_OBJECT   → Structures each attachment as key-value JSON
   * - COALESCE      → Ensures attachments is always an empty array instead of NULL
   *
   * GROUP BY:
   * - Required because JSON aggregation groups multiple attachment rows
   *   into a single transaction record.
   *
   * Pagination:
   * - LIMIT  → Restricts number of returned records
   * - OFFSET → Skips records for pagination
   *
   * Sorting:
   * - ORDER BY t.trn_date DESC → Latest transactions first
   */
  const [rows] = await db.query(
    `
    SELECT 
      t.trn_id AS trnId,
      t.amount,
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
    GROUP BY t.trn_id
    ORDER BY t.trn_date DESC
    LIMIT ? OFFSET ?
    `,
    [userId, limit, offset],
  );

  /**
   * 🔄 Post-process attachments
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
          // Remove NULL objects caused by LEFT JOIN JSON aggregation
          .filter((a) => a && a.filePath)
          .map((a) => {
            // Normalize file path for URLs
            // Converts Windows-style "\" into URL-friendly "/"
            const cleanPath = a.filePath.replace(/\\/g, "/");

            return {
              ...a,
              filePath: cleanPath,
              // Construct absolute public URL dynamically
              url: `${baseUrl}/${cleanPath}`,
            };
          })
      : [];

    return {
      ...trn,
      attachments,
    };
  });

  return transactions;
};

module.exports = {
  fetchTransactions,
};
