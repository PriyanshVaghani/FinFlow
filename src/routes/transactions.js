// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const fs = require("fs"); // 📁 File system (read / delete files)
const crypto = require("crypto"); // 🔐 Used for file hashing
const db = require("../config/db"); // 🗄️ MySQL connection pool
const upload = require("../middleware/upload"); // 📎 Multer upload config

// 🔐 JWT authentication middleware
const { authenticationToken } = require("../middleware/auth_middleware");

// 📤 Standard API response helpers
const { sendSuccess, sendError } = require("../utils/responseHelper");

// =======================================
// 🔐 Generate File Hash (SHA-256)
// =======================================
// Purpose:
// - Generates a unique hash based on file CONTENT
// - Used to detect duplicate attachments
// - Same file content → same hash
const getFileHash = (filePath) => {
  // 📖 Read file as buffer
  const fileBuffer = fs.readFileSync(filePath);

  // 🔐 Generate SHA-256 hash
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
};

/**
 * ======================================================
 * 📥 GET /transactions
 * ======================================================
 * @route   GET /transactions
 * @desc    Fetch all transactions of the logged-in user
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Fetch transactions with category info
 * - Attach related files (if any)
 * - Format attachment URLs
 */
router.get("/", authenticationToken, async (req, res) => {
  // 🔐 Extract userId added by authenticationToken middleware
  const userId = req.userId;

  try {
    /**
     * 📊 Fetch transactions with attachments
     *
     * - transactions (t): main transaction data
     * - categories (c): category name & type
     * - transaction_attachments (ta): optional attachments
     *
     * LEFT JOIN is used for attachments because:
     * - A transaction MAY have zero attachments
     *
     * JSON_ARRAYAGG:
     * - Converts multiple attachment rows into a single JSON array
     *
     * COALESCE:
     * - Ensures attachments is always an array (not NULL)
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
      `,
      [userId],
    );

    /**
     * 🔄 Post-process attachments
     *
     * - Remove NULL attachment objects
     * - Convert Windows paths (\) to URL-safe (/)
     * - Generate public file URLs
     */
    const transactions = rows.map((trn) => {
      // Ensure attachments is a valid array
      const attachments = Array.isArray(trn.attachments)
        ? trn.attachments
            // Remove NULL objects caused by LEFT JOIN
            .filter((a) => a && a.filePath)
            .map((a) => {
              // Normalize file path for URLs
              const cleanPath = a.filePath.replace(/\\/g, "/");

              return {
                ...a,
                filePath: cleanPath,
                // Generate full public URL
                url: `${req.protocol}://${req.get("host")}/${cleanPath}`,
              };
            })
        : [];

      return {
        ...trn,
        attachments,
      };
    });

    // ✅ Send success response
    return sendSuccess(res, { data: transactions });
  } catch (err) {
    // ❌ Handle unexpected server errors
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * 📤 POST /transactions/add
 * ======================================================
 * @route   POST /transactions/add
 * @desc    Add a new transaction with optional attachments
 * @access  Private (JWT protected)
 *
 * Features:
 * - Atomic DB transaction
 * - Duplicate attachment detection
 * - File cleanup on failure
 */
router.post(
  "/add",

  // 🔐 JWT Authentication
  authenticationToken,

  /**
   * 📎 MULTER FILE UPLOAD HANDLER
   * - Accepts max 5 files
   * - Handles upload errors locally
   */
  (req, res, next) => {
    upload.array("attachments", 5)(req, res, (err) => {
      // ℹ️ err is ONLY related to Multer (file upload phase)
      // It does NOT include controller / DB errors
      if (!err) {
        return next();
      }

      // ❌ File size limit exceeded
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendError(res, {
          statusCode: 413,
          message: "File size too large. Maximum allowed size is 5MB.",
        });
      }

      // ❌ Any other Multer or file validation error
      return sendError(res, {
        statusCode: 400,
        message: err.message || "File upload failed",
      });
    });
  },

  /**
   * 🧠 MAIN CONTROLLER LOGIC
   */
  async (req, res) => {
    // 🔐 Logged-in user ID (set by authenticationToken middleware)
    const userId = req.userId;

    // 📥 Extract form fields (sent as multipart/form-data text fields)
    const { categoryId, amount, note, trnDate } = req.body;

    // ❗ Required field validation
    if (!categoryId || !amount || !trnDate) {
      return sendError(res, {
        statusCode: 422,
        message: "categoryId, amount and trnDate are required",
      });
    }

    // 🔄 Get DB connection for transaction handling
    // Required for manual commit / rollback
    const conn = await db.getConnection();

    try {
      /**
       * 2️⃣ Start MySQL transaction
       * Ensures:
       * - Either transaction + attachments BOTH save
       * - Or NOTHING saves (rollback)
       */
      await conn.beginTransaction();

      /**
       * 3️⃣ Insert transaction record
       * Attachment records depend on this transaction ID
       */
      const [result] = await conn.query(
        `
        INSERT INTO transactions
        (user_id, category_id, amount, note, trn_date)
        VALUES (?, ?, ?, ?, ?)
        `,
        [userId, categoryId, amount, note || null, trnDate],
      );

      // 📌 Get newly created transaction ID
      // Used as foreign key for attachments
      const trnId = result.insertId;

      /**
       * 4️⃣ Insert attachments (if provided)
       * - Duplicate files are skipped using file_hash
       * - Skipped duplicate files are removed from disk immediately
       */
      if (req.files && req.files.length > 0) {
        const values = [];

        for (const file of req.files) {
          // 🔐 Hash uniquely identifies file CONTENT (not filename)
          const fileHash = getFileHash(file.path);

          // 🔍 Check duplicate for same transaction
          const [[exists]] = await conn.query(
            `
              SELECT 1 FROM transaction_attachments
              WHERE trn_id = ? AND file_hash = ?
            `,
            [trnId, fileHash],
          );

          if (exists) {
            // 🧹 Prevent duplicate storage on disk
            fs.unlinkSync(file.path);
            continue;
          }

          // ✅ Prepare unique attachment for DB insert
          values.push([
            trnId,
            file.originalname,
            file.path,
            file.mimetype,
            file.size,
            fileHash,
          ]);
        }

        // 📥 Insert only if at least one unique attachment exists
        if (values.length > 0) {
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

      /**
       * 5️⃣ Commit DB transaction
       * All changes become permanent here
       */
      await conn.commit();

      // ✅ Success response
      return sendSuccess(res, {
        statusCode: 201,
        message: "Transaction added successfully.",
      });
    } catch (err) {
      /**
       * ❌ Rollback on any error
       * Includes:
       * - DB errors
       * - Attachment insert failures
       */
      await conn.rollback();

      return sendError(res, {
        statusCode: 500,
        message: err.message,
      });
    } finally {
      /**
       * 🔚 Release DB connection back to pool
       * Always runs (success or failure)
       */
      conn.release();
    }
  },
);

/**
 * ==========================================
 * ✏️ UPDATE TRANSACTION API
 * ==========================================
 * @route   PUT /transactions/update
 * @desc    Update an existing transaction along with attachments
 * @access  Private (JWT protected)
 *
 * Features:
 * - Update transaction details
 * - Delete selected attachments
 * - Upload new attachments
 * - Atomic DB transaction (commit / rollback)
 * ==========================================
 */
router.put(
  "/update",

  // 🔐 JWT authentication middleware
  authenticationToken,

  /**
   * ==========================================
   * 📎 MULTER FILE UPLOAD MIDDLEWARE
   * ==========================================
   * - Handles attachment uploads before controller
   * - Accepts max 5 files under key: "attachments"
   * - Handles Multer-specific errors locally
   * - Prevents request from reaching controller if upload fails
   * ==========================================
   */
  (req, res, next) => {
    upload.array("attachments", 5)(req, res, (err) => {
      // ✅ No Multer error → move to controller
      if (!err) {
        return next();
      }

      // ❌ File size exceeds configured limit
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendError(res, {
          statusCode: 413,
          message: "File size too large. Maximum allowed size is 5MB.",
        });
      }

      // ❌ Any other Multer / validation error
      return sendError(res, {
        statusCode: 400,
        message: err.message || "File upload failed",
      });
    });
  },

  /**
   * ==========================================
   * 🧠 MAIN CONTROLLER LOGIC
   * ==========================================
   * Responsibilities:
   * 1. Validate input
   * 2. Update transaction record
   * 3. Delete selected attachments (DB + disk)
   * 4. Insert new attachments (avoid duplicates)
   * 5. Maintain DB consistency using transaction
   * ==========================================
   */
  async (req, res) => {
    // 👤 Extract authenticated user ID
    const userId = req.userId;

    // 📥 Transaction ID from query params
    const { trnId } = req.query;

    // 📥 Updated transaction values from request body
    const {
      categoryId,
      amount,
      note,
      trnDate,
      deleteAttachmentIds = [], // Optional attachment IDs to delete
    } = req.body;

    /**
     * ❗ BASIC INPUT VALIDATION
     * Required fields must be present
     */
    if (!categoryId || !amount || !trnDate) {
      return sendError(res, {
        statusCode: 422,
        message: "categoryId, amount and trnDate are required.",
      });
    }

    // 🔄 Obtain DB connection for transactional operations
    const conn = await db.getConnection();

    try {
      /**
       * ==========================================
       * 🔐 BEGIN DATABASE TRANSACTION
       * ==========================================
       * Ensures all DB operations succeed together:
       * - Transaction update
       * - Attachment deletion
       * - Attachment insertion
       * ==========================================
       */
      conn.beginTransaction();

      /**
       * ✏️ UPDATE TRANSACTION RECORD
       * - Ensures update is user-specific
       * - Prevents unauthorized updates
       */
      const [result] = await db.query(
        `
        UPDATE transactions
        SET 
          category_id = ?,    -- Updated category
          amount = ?,         -- Updated amount
          note = ?,           -- Updated note
          trn_date = ?        -- Updated transaction date
        WHERE trn_id = ?
          AND user_id = ?     -- Ownership check
        `,
        [categoryId, amount, note || null, trnDate, trnId, userId],
      );

      // ❌ No matching transaction found
      if (result.affectedRows === 0) {
        return sendError(res, {
          statusCode: 404,
          message: "Transaction not found.",
        });
      }

      /**
       * ==========================================
       * 🗑️ DELETE SELECTED ATTACHMENTS (OPTIONAL)
       * ==========================================
       * Steps:
       * 1. Fetch file paths from DB
       * 2. Delete physical files from disk
       * 3. Delete DB records
       * ==========================================
       */
      if (deleteAttachmentIds.length > 0) {
        const [filesPath] = await db.query(
          `
          SELECT file_path
          FROM transaction_attachments
          WHERE trn_id = ?
            AND attachment_id IN (?)
          `,
          [trnId, deleteAttachmentIds],
        );

        // 🧹 Delete files from filesystem
        for (const f of filesPath) {
          if (fs.existsSync(f.file_path)) {
            fs.unlinkSync(f.file_path);
          }
        }

        // 🗑️ Remove attachment records from database
        await db.query(
          `
          DELETE FROM transaction_attachments
          WHERE trn_id = ?
            AND attachment_id IN (?)
          `,
          [trnId, deleteAttachmentIds],
        );
      }

      /**
       * ==========================================
       * 📎 INSERT NEW ATTACHMENTS (OPTIONAL)
       * ==========================================
       * - Files already saved by Multer
       * - Avoids duplicate uploads using file hash
       * - Inserts only unique attachments
       * ==========================================
       */
      if (req.files && req.files.length > 0) {
        const values = [];

        for (const file of req.files) {
          const fileHash = getFileHash(file.path);

          // 🔍 Check for duplicate file using hash
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
            // 🧹 Remove duplicate file from disk
            fs.unlinkSync(file.path);
            continue;
          }

          // ✅ Prepare insert values
          values.push([
            trnId,
            file.originalname,
            file.path,
            file.mimetype,
            file.size,
            fileHash,
          ]);
        }

        // 📥 Insert only if new files exist
        if (values.length > 0) {
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

      /**
       * ✅ COMMIT TRANSACTION
       * Executes only if all steps succeed
       */
      await conn.commit();

      // 🎉 Success response
      return sendSuccess(res, {
        statusCode: 200,
        message: "Transaction updated successfully.",
      });
    } catch (err) {
      /**
       * ❌ ROLLBACK ON FAILURE
       * Reverts all DB changes on any error
       */
      await conn.rollback();

      /**
       * 🧹 CLEANUP UPLOADED FILES
       * Prevents orphan files when DB operation fails
       */
      if (req.files) {
        req.files.forEach((f) => {
          if (fs.existsSync(f.path)) {
            fs.unlinkSync(f.path);
          }
        });
      }

      return sendError(res, {
        statusCode: 500,
        message: err.message,
      });
    } finally {
      // 🔚 Always release DB connection
      conn.release();
    }
  },
);

/**
 * ======================================================
 * 🗑️ DELETE TRANSACTION
 * ======================================================
 * @route   DELETE /transactions/delete
 * @desc    Delete a transaction
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Delete transaction owned by logged-in user
 * - Remove related attachment files from disk
 * - Maintain DB consistency using transaction
 */
router.delete("/delete", authenticationToken, async (req, res) => {
  // 👤 Logged-in user ID
  const userId = req.userId;

  // 📥 Transaction ID from query
  const { trnId } = req.query;

  // 🔄 Get DB connection for transaction handling
  const conn = await db.getConnection();

  try {
    // 🔐 Begin database transaction
    await conn.beginTransaction();

    /**
     * 📄 Fetch attachment file paths before deletion
     * Required because DB records will be removed after transaction delete
     */
    const [attachments] = await conn.query(
      `
      SELECT file_path
      FROM transaction_attachments
      WHERE trn_id = ?
      `,
      [trnId],
    );

    // 🗑️ Delete transaction safely (ownership enforced)
    const [result] = await db.query(
      `
      DELETE FROM transactions
      WHERE user_id = ? AND trn_id = ?
      `,
      [userId, trnId],
    );

    // ❌ Transaction not found or not owned by user
    if (result.affectedRows === 0) {
      await conn.rollback();
      return sendError(res, {
        statusCode: 404,
        message: "Transaction not found.",
      });
    }

    /**
     * 🧹 Delete physical attachment files
     * (DB records already removed via ON DELETE CASCADE)
     */
    for (const file of attachments) {
      if (fs.existsSync(file.file_path)) {
        fs.unlinkSync(file.file_path);
      }
    }

    // ✅ Commit DB transaction
    await conn.commit();

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Transaction deleted successfully.",
    });
  } catch (err) {
    // ❌ Rollback on any failure
    await conn.rollback();

    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  } finally {
    // 🔚 Always release DB connection
    conn.release();
  }
});

/**
 * ======================================================
 * 🔁 GET ALL RECURRING TRANSACTIONS (WITH CATEGORY)
 * ======================================================
 * @route   GET /recurring/
 * @desc    Fetch all recurring expenses with category details
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Fetch all recurring transactions for logged-in user
 * - Join category details (name, type)
 * - Return sorted by latest created
 */
router.get("/recurring/", authenticationToken, async (req, res) => {
  // 👤 Logged-in user ID
  const userId = req.userId;

  try {
    /**
     * 📄 Fetch recurring transactions
     * - Includes category information
     * - Ordered by newest first
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
        r.last_run_date,
        r.created_at,

        -- 📂 Category details
        c.category_id,
        c.name,
        c.type
      FROM recurring_transactions r
      INNER JOIN categories c
        ON c.category_id = r.category_id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      `,
      [userId],
    );

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  } catch (err) {
    // ❌ Handle server errors
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * 🔁 ADD RECURRING TRANSACTION
 * ======================================================
 * @route   POST /recurring/add
 * @desc    Add a recurring expense for logged-in user
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Validate required recurring expense fields
 * - Store recurring transaction details
 * - Support optional note and end date
 */
router.post("/recurring/add", authenticationToken, async (req, res) => {
  // 👤 Logged-in user ID
  const userId = req.userId;

  // 📥 Extract request body
  const { categoryId, amount, note, frequency, startDate, endDate } = req.body;

  // ❗ Validation: mandatory fields check
  if (!categoryId || !amount || !frequency || !startDate) {
    return sendError(res, {
      statusCode: 422,
      message: "Required fields missing",
    });
  }

  try {
    /**
     * ➕ Insert recurring transaction
     * - note is optional
     * - end_date can be NULL (no expiration)
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

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 201,
      message: "Recurring expense added successfully",
    });
  } catch (err) {
    // ❌ Handle unexpected server errors
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * 🔁 UPDATE RECURRING TRANSACTION (Details + Status)
 * ======================================================
 * @route   PUT /recurring/update
 * @desc    Update recurring expense details or activate/deactivate
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Allow partial updates (dynamic fields)
 * - Support status toggle (is_active)
 * - Ensure user ownership before update
 */
router.put("/recurring/update", authenticationToken, async (req, res) => {
  // 👤 Logged-in user ID
  const userId = req.userId;

  // 📥 Recurring ID from query
  const { recurringId } = req.query;

  // 📥 Request body fields
  const { categoryId, amount, note, frequency, startDate, endDate, isActive } =
    req.body;

  // ❗ recurringId is mandatory
  if (!recurringId) {
    return sendError(res, {
      statusCode: 422,
      message: "Recurring ID is required",
    });
  }

  try {
    /**
     * 🛠 Build dynamic update fields
     * Only provided fields will be updated
     */
    const fields = [];
    const values = [];

    if (categoryId) {
      fields.push("category_id = ?");
      values.push(categoryId);
    }

    if (amount) {
      fields.push("amount = ?");
      values.push(amount);
    }

    if (note !== undefined) {
      fields.push("note = ?");
      values.push(note || null);
    }

    if (frequency) {
      fields.push("frequency = ?");
      values.push(frequency);
    }

    if (startDate) {
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

    // ❌ No fields provided
    if (fields.length === 0) {
      return sendError(res, {
        statusCode: 422,
        message: "No fields provided to update",
      });
    }

    /**
     * ✏️ Execute update
     * Ensures record belongs to logged-in user
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

    // ❌ Not found or not owned
    if (result.affectedRows === 0) {
      return sendError(res, {
        statusCode: 404,
        message: "Recurring expense not found",
      });
    }

    // 🎉 Success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Recurring expense updated successfully",
    });
  } catch (err) {
    // ❌ Handle server errors
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
