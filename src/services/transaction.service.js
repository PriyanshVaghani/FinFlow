// =======================================
// 📦 Import Required Modules
// =======================================
// file system and crypto needed for attachment handling
const fs = require("fs");
const crypto = require("crypto");

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
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - transactions (t)         → Primary transaction records
   * - transaction_attachments (ta) → Optional file attachments
   * - categories (c)           → Category details and types
   *
   * LEFT JOIN transaction_attachments:
   * - Includes attachments if they exist
   * - Allows transactions without attachments
   *
   * JOIN categories:
   * - Required since every transaction has a category
   *
   * JSON_ARRAYAGG:
   * - Aggregates multiple attachment rows into single JSON array
   *
   * JSON_OBJECT:
   * - Structures each attachment as JSON object with properties
   *
   * CASE WHEN ta.attachment_id IS NOT NULL:
   * - Excludes NULL rows from LEFT JOIN in aggregation
   *
   * COALESCE(..., JSON_ARRAY()):
   * - Returns empty array instead of NULL when no attachments
   *
   * CAST(t.amount AS DOUBLE):
   * - Ensures numeric type consistency
   *
   * WHERE t.user_id = ?:
   * - Enforces user data isolation
   *
   * ${whereClause}:
   * - Dynamic filters (date, category, amount, search)
   *
   * GROUP BY t.trn_id:
   * - Required for JSON aggregation to prevent duplicates
   *
   * ORDER BY ${finalSortBy} ${finalOrder}:
   * - Dynamic sorting with safe column validation
   *
   * LIMIT ? OFFSET ?:
   * - Pagination controls
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
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - transactions (t) → Primary transaction records
   * - categories (c)   → Category details
   *
   * JOIN categories:
   * - Ensures category exists (though not used in SELECT)
   *
   * COUNT(DISTINCT t.trn_id):
   * - Counts unique transactions
   * - DISTINCT prevents overcounting from potential JOIN duplicates
   *
   * WHERE t.user_id = ?:
   * - User data isolation
   *
   * ${whereClause}:
   * - Same dynamic filters as main query
   */
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

// ---------------------------------------
// helper: compute file hash
const getFileHash = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
};

/**
 * ======================================================
 * 📥 ADD TRANSACTION SERVICE
 * ======================================================
 * Inserts a transaction and optional attachments
 * inside a single DB transaction. Handles duplicate
 * attachment detection and file cleanup on error.
 */
const addTransaction = async (
  db,
  userId,
  { categoryId, amount, note, trnDate },
  files = [],
) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - transactions → Primary transaction records
     *
     * INSERT Operation:
     * - Creates new transaction record
     * - Links to user and category
     * - Stores amount, note, and transaction date
     * - note uses NULL if not provided
     */
    const [result] = await conn.query(
      `
        INSERT INTO transactions
        (user_id, category_id, amount, note, trn_date)
        VALUES (?, ?, ?, ?, ?)
        `,
      [userId, categoryId, amount, note || null, trnDate],
    );

    const trnId = result.insertId;

    if (files && files.length > 0) {
      const values = [];
      for (const file of files) {
        const fileHash = getFileHash(file.path);
        /**
         * 📊 SQL Query Explanation
         *
         * Tables Used:
         * - transaction_attachments → File attachment records
         *
         * SELECT 1:
         * - Efficient existence check (no need for full row)
         *
         * WHERE trn_id = ? AND file_hash = ?:
         * - Checks if this exact file is already attached to transaction
         * - Prevents duplicate attachments
         */
        const [[exists]] = await conn.query(
          `
            SELECT 1 FROM transaction_attachments
            WHERE trn_id = ? AND file_hash = ?
          `,
          [trnId, fileHash],
        );

        if (exists) {
          // remove duplicate physical file
          fs.unlinkSync(file.path);
          continue;
        }

        values.push([
          trnId,
          file.originalname,
          file.path,
          file.mimetype,
          file.size,
          fileHash,
        ]);
      }

      if (values.length > 0) {
        /**
         * 📊 SQL Query Explanation
         *
         * Tables Used:
         * - transaction_attachments → File attachment records
         *
         * INSERT ... VALUES ?:
         * - Bulk insert multiple attachment records
         * - VALUES ? accepts array of arrays for batch insertion
         *
         * Fields:
         * - trn_id: Links to transaction
         * - file_name: Original filename
         * - file_path: Server storage path
         * - file_type: MIME type
         * - file_size: File size in bytes
         * - file_hash: SHA256 hash for duplicate detection
         */
        await conn.query(
          `
            INSERT INTO transaction_attachments
            (trn_id, file_name, file_path, file_type, file_size, file_hash)
            VALUES ?
          `,
          [values],
        );
      }
    }

    await conn.commit();
    return { trnId };
  } catch (err) {
    await conn.rollback();
    // cleanup any uploaded files on error
    if (files && files.length > 0) {
      files.forEach((f) => {
        if (fs.existsSync(f.path)) {
          fs.unlinkSync(f.path);
        }
      });
    }
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * ======================================================
 * ✏️ UPDATE TRANSACTION SERVICE
 * ======================================================
 * Performs partial transaction updates along with
 * optional attachment removals/additions.
 */
const updateTransaction = async (
  db,
  userId,
  trnId,
  { categoryId, amount, note, trnDate, deleteAttachmentIds = [] },
  files = [],
) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // update fields if provided
    const setFields = [];
    const setValues = [];

    if (categoryId !== undefined) {
      setFields.push("category_id = ?");
      setValues.push(categoryId);
    }
    if (amount !== undefined) {
      setFields.push("amount = ?");
      setValues.push(amount);
    }
    if (note !== undefined) {
      setFields.push("note = ?");
      setValues.push(note === "" ? null : note);
    }
    if (trnDate !== undefined) {
      setFields.push("trn_date = ?");
      setValues.push(trnDate);
    }

    if (setFields.length > 0) {
      /**
       * 📊 SQL Query Explanation
       *
       * Tables Used:
       * - transactions → Primary transaction records
       *
       * UPDATE Operation:
       * - Dynamically updates only provided fields
       * - Supports partial updates (category, amount, note, date)
       *
       * SET ${setFields.join(", ")}:
       * - Dynamic field updates based on provided values
       *
       * WHERE trn_id = ? AND user_id = ?:
       * - Targets specific transaction
       * - Ensures user ownership
       */
      const [res] = await conn.query(
        `
          UPDATE transactions
          SET ${setFields.join(", ")}
          WHERE trn_id = ?
            AND user_id = ?
          `,
        [...setValues, trnId, userId],
      );

      if (res.affectedRows === 0) {
        throw new Error("Transaction not found");
      }
    } else {
      // still verify existence
      /**
       * 📊 SQL Query Explanation
       *
       * Tables Used:
       * - transactions → Primary transaction records
       *
       * SELECT 1:
       * - Efficient existence check when no fields are being updated
       *
       * WHERE trn_id = ? AND user_id = ?:
       * - Verifies transaction exists and belongs to user
       */
      const [[row]] = await conn.query(
        "SELECT 1 FROM transactions WHERE trn_id = ? AND user_id = ?",
        [trnId, userId],
      );
      if (!row) {
        throw new Error("Transaction not found");
      }
    }

    // delete attachments if requested
    if (deleteAttachmentIds.length > 0) {
      /**
       * 📊 SQL Query Explanation
       *
       * Tables Used:
       * - transaction_attachments → File attachment records
       *
       * SELECT file_path:
       * - Retrieves file paths for physical file deletion
       *
       * WHERE trn_id = ? AND attachment_id IN (?):
       * - Targets specific attachments for this transaction
       * - IN (?) allows multiple attachment IDs
       */
      const [paths] = await conn.query(
        `
          SELECT file_path
          FROM transaction_attachments
          WHERE trn_id = ?
            AND attachment_id IN (?)
        `,
        [trnId, deleteAttachmentIds],
      );

      for (const f of paths) {
        if (fs.existsSync(f.file_path)) {
          fs.unlinkSync(f.file_path);
        }
      }

      /**
       * 📊 SQL Query Explanation
       *
       * Tables Used:
       * - transaction_attachments → File attachment records
       *
       * DELETE Operation:
       * - Removes attachment records from database
       *
       * WHERE trn_id = ? AND attachment_id IN (?):
       * - Targets specific attachments for this transaction
       * - IN (?) allows bulk deletion of multiple attachments
       */
      await conn.query(
        `
          DELETE FROM transaction_attachments
          WHERE trn_id = ?
            AND attachment_id IN (?)
        `,
        [trnId, deleteAttachmentIds],
      );
    }

    // add new attachments if any
    if (files && files.length > 0) {
      const values = [];
      for (const file of files) {
        const fileHash = getFileHash(file.path);
        /**
         * 📊 SQL Query Explanation
         *
         * Tables Used:
         * - transaction_attachments → File attachment records
         *
         * SELECT 1:
         * - Efficient existence check for duplicate prevention
         *
         * WHERE trn_id = ? AND file_hash = ?:
         * - Checks if this exact file is already attached
         * - Prevents duplicate attachments during update
         */
        const [[exists]] = await conn.query(
          `
            SELECT 1
            FROM transaction_attachments
            WHERE trn_id = ?
              AND file_hash = ?
          `,
          [trnId, fileHash],
        );

        if (exists) {
          fs.unlinkSync(file.path);
          continue;
        }

        values.push([
          trnId,
          file.originalname,
          file.path,
          file.mimetype,
          file.size,
          fileHash,
        ]);
      }
      if (values.length > 0) {
        /**
         * 📊 SQL Query Explanation
         *
         * Tables Used:
         * - transaction_attachments → File attachment records
         *
         * INSERT ... VALUES ?:
         * - Bulk insert new attachment records during update
         * - VALUES ? accepts array of arrays for batch insertion
         *
         * Fields: Same as addTransaction (trn_id, file_name, etc.)
         * - Used when adding attachments to existing transaction
         */
        await conn.query(
          `
            INSERT INTO transaction_attachments
            (trn_id, file_name, file_path, file_type, file_size, file_hash)
            VALUES ?
          `,
          [values],
        );
      }
    }

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    // cleanup uploaded files
    if (files && files.length > 0) {
      files.forEach((f) => {
        if (fs.existsSync(f.path)) {
          fs.unlinkSync(f.path);
        }
      });
    }
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * ======================================================
 * 🗑️ DELETE TRANSACTION SERVICE
 * ======================================================
 * Deletes a transaction and its attachments, and cleans
 * up physical files.
 */
const deleteTransaction = async (db, userId, trnId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - transaction_attachments → File attachment records
     *
     * SELECT file_path:
     * - Retrieves all file paths for this transaction
     * - Needed to clean up physical files after deletion
     *
     * WHERE trn_id = ?:
     * - Gets attachments for the transaction being deleted
     */
    const [attachments] = await conn.query(
      `
      SELECT file_path
      FROM transaction_attachments
      WHERE trn_id = ?
      `,
      [trnId],
    );

    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - transactions → Primary transaction records
     *
     * DELETE Operation:
     * - Permanently removes transaction record
     *
     * WHERE user_id = ? AND trn_id = ?:
     * - Ensures user owns the transaction
     * - Targets specific transaction for deletion
     */
    const [result] = await conn.query(
      `
      DELETE FROM transactions
      WHERE user_id = ? AND trn_id = ?
      `,
      [userId, trnId],
    );

    if (result.affectedRows === 0) {
      throw new Error("Transaction not found");
    }

    for (const file of attachments) {
      if (fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
      }
    }

    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * ======================================================
 * 📄 GET RECURRING TRANSACTIONS SERVICE
 * ======================================================
 */
const getRecurringTransactions = async (db, userId) => {
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - recurring_transactions (r) → Recurring transaction definitions
   * - categories (c)             → Category details
   *
   * JOIN categories:
   * - Links recurring transactions to their categories
   *
   * SELECT Fields:
   * - r.*: All recurring transaction fields
   * - c.category_id, c.name, c.type: Category information
   *
   * WHERE r.user_id = ?:
   * - Filters to user's recurring transactions
   *
   * ORDER BY r.recurring_id DESC:
   * - Returns most recently created first
   */
  const [rows] = await db.query(
    `
    SELECT
      r.recurring_id,
      r.amount,
      r.note,
      r.frequency,
      r.start_date,
      r.end_date,
      r.is_active,
      c.category_id,
      c.name AS categoryName,
      c.type
    FROM recurring_transactions r
    JOIN categories c ON r.category_id = c.category_id
    WHERE r.user_id = ?
    ORDER BY r.recurring_id DESC
    `,
    [userId],
  );
  return rows;
};

/**
 * ======================================================
 * 🔁 ADD RECURRING TRANSACTION SERVICE
 * ======================================================
 */
const addRecurringTransaction = async (
  db,
  userId,
  { categoryId, amount, note, frequency, startDate, endDate },
) => {
  try {
    /**
     * 📊 SQL Query Explanation
     *
     * Tables Used:
     * - recurring_transactions → Recurring transaction definitions
     *
     * INSERT Operation:
     * - Creates new recurring transaction schedule
     *
     * Fields:
     * - user_id: Owner of the recurring transaction
     * - category_id: Associated category
     * - amount, note: Transaction details
     * - frequency: How often to repeat (daily/weekly/monthly)
     * - start_date: When to begin
     * - end_date: When to stop (NULL for indefinite)
     */
    await db.query(
      `
        INSERT INTO recurring_transactions
        (user_id, category_id, amount, note, frequency, start_date, end_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        categoryId,
        amount,
        note || null,
        frequency,
        startDate,
        endDate || null,
      ],
    );
    return true;
  } catch (err) {
    throw err;
  }
};

/**
 * ======================================================
 * 🔁 UPDATE RECURRING TRANSACTION SERVICE
 * ======================================================
 */
const updateRecurringTransaction = async (db, userId, recurringId, updates) => {
  const fields = [];
  const values = [];

  const { categoryId, amount, note, frequency, startDate, endDate, isActive } =
    updates;

  if (categoryId !== undefined) {
    fields.push("category_id = ?");
    values.push(categoryId);
  }
  if (amount !== undefined) {
    fields.push("amount = ?");
    values.push(amount);
  }
  if (note !== undefined) {
    fields.push("note = ?");
    values.push(note || null);
  }
  if (frequency !== undefined) {
    fields.push("frequency = ?");
    values.push(frequency);
  }
  if (startDate !== undefined) {
    fields.push("start_date = ?");
    values.push(startDate);
  }
  if (endDate !== undefined) {
    fields.push("end_date = ?");
    values.push(endDate || null);
  }
  if (isActive !== undefined) {
    fields.push("is_active = ?");
    values.push(isActive);
  }

  if (fields.length === 0) {
    throw new Error("No fields provided to update");
  }

  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - recurring_transactions → Recurring transaction definitions
   *
   * UPDATE Operation:
   * - Dynamically updates only provided fields
   * - Supports partial updates (category, amount, note, etc.)
   *
   * SET ${fields.join(", ")}:
   * - Dynamic field updates based on provided values
   * - Can update: category_id, amount, note, frequency, dates, is_active
   *
   * WHERE recurring_id = ? AND user_id = ?:
   * - Targets specific recurring transaction
   * - Ensures user ownership
   */
  const [result] = await db.query(
    `
      UPDATE recurring_transactions
      SET ${fields.join(", ")}
      WHERE recurring_id = ?
        AND user_id = ?
    `,
    [...values, recurringId, userId],
  );

  if (result.affectedRows === 0) {
    throw new Error("Recurring expense not found");
  }

  return true;
};

// =======================================
// 📤 Export Module
// =======================================

module.exports = {
  fetchTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getRecurringTransactions,
  addRecurringTransaction,
  updateRecurringTransaction,
};
