// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();

const fs = require("fs"); // 📁 File system (read / delete files)
const crypto = require("crypto"); // 🔐 Used for file hashing
const db = require("../config/db"); // 🗄️ MySQL connection pool
const upload = require("../middleware/upload"); // 📎 Multer upload config

const { fetchTransactions } = require("../services/transaction.service"); // 📊 Transaction service (filtering, sorting, pagination)
const { isValidISODate } = require("../utils/validation"); // ✅ ISO date validation utility

// 🔐 JWT authentication middleware
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔑 Verifies access token & extracts userId

// 📤 Standard API response helpers
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📦 Unified API success & error responses

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
 * @desc    Fetch paginated & filtered transactions of the logged-in user
 * @access  Private (JWT protected)
 *
 * Architecture Flow:
 * Controller (this file)
 *    ↓ (passes filters + pagination + sorting + baseUrl)
 * Service Layer (fetchTransactions)
 *    ↓
 * Database
 *
 * Query Params:
 * - skip (optional) → Number of records to skip (default: 0)
 * - take (optional) → Number of records to return (default: 10)
 *
 * 🔎 Filtering Params (all optional):
 * - startDate (YYYY-MM-DD)
 * - endDate (YYYY-MM-DD)
 * - categoryIds (single or multiple)
 * - type (income | expense)
 * - minAmount
 * - maxAmount
 * - search (matches note or category name)
 *
 * 📊 Sorting Params:
 * - sortBy (amount | trn_date | categoryName)
 * - order (asc | desc)
 *
 * Responsibilities:
 * - Validate & extract pagination params
 * - Validate filter inputs (date, amount, type, search)
 * - Validate sorting inputs (safe DB columns only)
 * - Construct dynamic base URL from request
 * - Delegate filtering + sorting to service layer
 * - Return pagination metadata (totalCount, hasMore)
 */
router.get("/", authenticationToken, async (req, res) => {

  // 🔐 Extract authenticated user ID from middleware.
  // This ensures each user can only access their own transactions.
  const userId = req.userId;

  // 📄 Pagination Parameters
  // Math.max prevents negative values (e.g., skip=-10).
  // parseInt converts query string to number safely.
  const skip = Math.max(0, parseInt(req.query.skip) || 0);
  const take = Math.max(0, parseInt(req.query.take) || 10);

  // 📅 Date Range Filters
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  // Validate ISO date format to prevent invalid date parsing in DB queries.
  // This avoids runtime SQL errors and inconsistent filtering.
  if (startDate && !isValidISODate(startDate)) {
    return sendError(res, {
      statusCode: 400,
      message: "Invalid startDate format. Use YYYY-MM-DD",
    });
  }

  if (endDate && !isValidISODate(endDate)) {
    return sendError(res, {
      statusCode: 400,
      message: "Invalid endDate format. Use YYYY-MM-DD",
    });
  }

  // Logical validation: startDate must not exceed endDate.
  // Prevents meaningless queries like future-to-past range.
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return sendError(res, {
      statusCode: 400,
      message: "startDate cannot be greater than endDate",
    });
  }

  // 📂 Category Filter (supports single or multiple IDs)
  let categoryIds = req.query.categoryIds;

  if (!categoryIds) {
    categoryIds = [];
  } else if (!Array.isArray(categoryIds)) {
    categoryIds = [categoryIds];
  }

  // Keep only numeric IDs.
  // This prevents SQL injection and invalid category filtering.
  categoryIds = categoryIds
    .filter((id) => /^\d+$/.test(id))
    .map(Number);

  // 🔄 Type Filter (income / expense)
  let type = req.query.type;

  if (type) {
    type = type.toLowerCase();

    // Restrict to allowed values to prevent invalid filtering logic.
    if (!["income", "expense"].includes(type)) {
      return sendError(res, {
        statusCode: 400,
        message: "Invalid type. Allowed values: income, expense",
      });
    }
  }

  // 💰 Amount Range Filters
  const rawMinAmount = req.query.minAmount;
  const rawMaxAmount = req.query.maxAmount;

  let minAmount;
  let maxAmount;

  // Validate minimum amount
  if (rawMinAmount !== undefined) {
    minAmount = Number(rawMinAmount);

    // Number.isFinite ensures value is a real number (not NaN, Infinity, etc.)
    // Prevents malformed numeric queries.
    if (!Number.isFinite(minAmount)) {
      return sendError(res, {
        statusCode: 400,
        message: "minAmount must be a valid number",
      });
    }
  }

  // Validate maximum amount
  if (rawMaxAmount !== undefined) {
    maxAmount = Number(rawMaxAmount);

    if (!Number.isFinite(maxAmount)) {
      return sendError(res, {
        statusCode: 400,
        message: "maxAmount must be a valid number",
      });
    }
  }

  // Logical validation: max must not be smaller than min.
  // Prevents contradictory filter ranges.
  if (
    minAmount !== undefined &&
    maxAmount !== undefined &&
    maxAmount < minAmount
  ) {
    return sendError(res, {
      statusCode: 400,
      message: "maxAmount must be greater than or equal to minAmount",
    });
  }

  // 🔍 Search Filter (note or category name)
  let search = req.query.search;

  if (search !== undefined) {

    if (typeof search !== "string") {
      return sendError(res, {
        statusCode: 400,
        message: "Search must be a string",
      });
    }

    search = search.trim();

    // Prevent overly long search inputs.
    // Protects performance and avoids abuse (e.g., extremely long LIKE queries).
    if (search.length > 100) {
      return sendError(res, {
        statusCode: 400,
        message: "Search query too long (max 100 characters)",
      });
    }
  }

  // 📊 Sorting Validation
  // Only allow whitelisted DB columns.
  // This prevents SQL injection through dynamic ORDER BY.
  const allowedSortFields = {
    amount: "t.amount",
    trn_date: "t.trn_date",
    categoryName: "c.name",
  };

  const allowedOrders = ["asc", "desc"];

  let sortBy = req.query.sortBy || "trn_date";
  let order = req.query.order || "desc";

  if (!allowedSortFields[sortBy]) {
    return sendError(res, {
      statusCode: 400,
      message: "Invalid sort field",
    });
  }

  if (!allowedOrders.includes(order.toLowerCase())) {
    return sendError(res, {
      statusCode: 400,
      message: "Invalid order value",
    });
  }

  order = order.toUpperCase();

  // Safe DB column mapping
  const safeSortColumn = allowedSortFields[sortBy];

  // 🌐 Base URL Construction
  // Needed for generating absolute URLs for file attachments.
  // Avoids hardcoding domain values inside service layer.
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  try {
    // Delegate filtering, sorting, pagination to service layer.
    // Keeps controller thin and maintains separation of concerns.
    const result = await fetchTransactions(db, userId, {
      limit: take,
      offset: skip,
      baseUrl,
      startDate,
      endDate,
      categoryIds,
      type,
      minAmount,
      maxAmount,
      search,
      sortBy: safeSortColumn,
      order,
    });

    // hasMore indicates whether additional records exist.
    // Useful for frontend infinite scroll or pagination UI.
    return sendSuccess(res, {
      data: result.transactions,
      skip,
      take,
      totalCount: result.total,
      hasMore: skip + take < result.total,
    });

  } catch (err) {
    // Catch unexpected database/runtime errors.
    // Standardized error response keeps API consistent.
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
 * @desc    Partially update a transaction and/or attachments
 * @access  Private (JWT protected)
 *
 * Optional body fields (send only what you want to update):
 * - categoryId, amount, note, trnDate
 * - deleteAttachmentIds: array of attachment IDs to remove (or single id)
 * - attachments: new files (multipart)
 *
 * At least one of: transaction field(s), deleteAttachmentIds, or new attachments required.
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
   * 🧠 MAIN CONTROLLER LOGIC (partial update)
   * ==========================================
   * - Only provided transaction fields are updated
   * - Optional: add new attachments, remove by attachment IDs
   * ==========================================
   */
  async (req, res) => {
    // 👤 Extract authenticated user ID
    const userId = req.userId;

    // 📥 Transaction ID from query (required)
    const { trnId } = req.query;

    // 📥 Optional transaction fields (send only what you want to update)
    const {
      categoryId,
      amount,
      note,
      trnDate,
      deleteAttachmentIds: rawDeleteIds,
    } = req.body;

    const deleteAttachmentIds = Array.isArray(rawDeleteIds)
      ? rawDeleteIds
      : rawDeleteIds != null
        ? [rawDeleteIds]
        : [];

    const hasTransactionUpdates =
      categoryId !== undefined ||
      amount !== undefined ||
      note !== undefined ||
      trnDate !== undefined;
    const hasAttachmentRemoval = deleteAttachmentIds.length > 0;
    const hasNewAttachments = req.files && req.files.length > 0;

    if (!trnId) {
      return sendError(res, {
        statusCode: 422,
        message: "trnId is required (query param).",
      });
    }

    if (!hasTransactionUpdates && !hasAttachmentRemoval && !hasNewAttachments) {
      return sendError(res, {
        statusCode: 422,
        message:
          "Provide at least one field to update (categoryId, amount, note, trnDate), and/or deleteAttachmentIds, and/or new attachments.",
      });
    }

    // 🔄 Obtain DB connection for transactional operations
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // ✏️ UPDATE TRANSACTION RECORD (only provided fields)
      if (hasTransactionUpdates) {
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

        const [result] = await conn.query(
          `
          UPDATE transactions
          SET ${setFields.join(", ")}
          WHERE trn_id = ?
            AND user_id = ?
          `,
          [...setValues, trnId, userId],
        );

        if (result.affectedRows === 0) {
          await conn.rollback();
          return sendError(res, {
            statusCode: 404,
            message: "Transaction not found.",
          });
        }
      } else {
        // No transaction fields to update → still verify transaction exists and belongs to user
        const [[row]] = await conn.query(
          "SELECT 1 FROM transactions WHERE trn_id = ? AND user_id = ?",
          [trnId, userId],
        );
        if (!row) {
          await conn.rollback();
          return sendError(res, {
            statusCode: 404,
            message: "Transaction not found.",
          });
        }
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
        const [filesPath] = await conn.query(
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
        await conn.query(
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
    const [result] = await conn.query(
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
