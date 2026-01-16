// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const fs = require("fs");
const db = require("../config/db");
const upload = require("../middleware/upload");

// 🔐 JWT authentication middleware
const { authenticationToken } = require("../middleware/auth_middleware");

// 📤 Standard API response helpers
const { sendSuccess, sendError } = require("../utils/responseHelper");

/**
 * ======================================================
 * 📥 GET /transactions
 * ======================================================
 * @route   GET /transactions
 * @desc    Fetch all transactions of the logged-in user
 * @access  Private (JWT protected)
 */
router.get("/", authenticationToken, async (req, res) => {
  // 🔐 Extract userId added by authenticationToken middleware
  const userId = req.userId;

  try {
    /**
     * 1️⃣ Fetch transactions with category & attachment details
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
      [userId]
    );

    /**
     * 2️⃣ Post-process attachments
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
 */
router.post(
  "/add",

  // 🔐 JWT Authentication
  authenticationToken,

  // 📎 Multer middleware for handling file uploads
  // - Accepts up to 5 files under "attachments" field
  // - Handles Multer errors locally (no global error handler used)
  // - Ensures clean API error responses for upload failures
  (req, res, next) => {
    upload.array("attachments", 5)(req, res, (err) => {
      // ✅ No upload error → proceed to next middleware/controller
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

  async (req, res) => {
    // 🔐 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract form fields
    const { categoryId, amount, note, trnDate } = req.body;

    /**
     * 1️⃣ Validate required fields
     */
    if (!categoryId || !amount || !trnDate) {
      return sendError(res, {
        statusCode: 422,
        message: "categoryId, amount and trnDate are required",
      });
    }

    // 🔄 Get DB connection for transaction handling
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
       */
      const [result] = await conn.query(
        `
        INSERT INTO transactions
        (user_id, category_id, amount, note, trn_date)
        VALUES (?, ?, ?, ?, ?)
        `,
        [userId, categoryId, amount, note || null, trnDate]
      );

      // 📌 Get newly created transaction ID
      const trnId = result.insertId;

      /**
       * 4️⃣ Insert attachments (if provided)
       */
      if (req.files && req.files.length > 0) {
        // Prepare bulk insert values
        const values = req.files.map((file) => [
          trnId,
          file.originalname, // original filename
          file.path, // stored file path
          file.mimetype, // file type
          file.size, // file size
        ]);

        await conn.query(
          `
          INSERT INTO transaction_attachments
          (trn_id, file_name, file_path, file_type, file_size)
          VALUES ?
          `,
          [values]
        );
      }

      /**
       * 5️⃣ Commit DB transaction
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
       */
      await conn.rollback();

      return sendError(res, {
        statusCode: 500,
        message: err.message,
      });
    } finally {
      /**
       * 🔚 Release DB connection
       */
      conn.release();
    }
  }
);

/**
 * @route   PUT /transactions/update
 * @desc    Update an existing transaction
 * @access  Private
 */
router.put(
  "/update",
  authenticationToken,

  /**
   * 📎 Multer middleware
   * Handles attachment uploads before main controller logic
   * - Accepts max 5 files under "attachments"
   * - Handles Multer-specific errors locally (no global error handler)
   */
  (req, res, next) => {
    upload.array("attachments", 5)(req, res, (err) => {
      // ✅ No upload error → proceed to next middleware/controller
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
   * 🧠 Main controller logic
   * Handles:
   * - Transaction update
   * - Attachment deletion
   * - New attachment insertion
   * - Atomic DB transaction (commit / rollback)
   */
  async (req, res) => {
    const userId = req.userId;

    // 📥 Get transaction ID from query
    const { trnId } = req.query;

    // 📥 Get updated values from body
    const {
      categoryId,
      amount,
      note,
      trnDate,
      deleteAttachmentIds = [], // attachment IDs to delete (optional)
    } = req.body;

    // ❗ Validation
    if (!categoryId || !amount || !trnDate) {
      return sendError(res, {
        statusCode: 422,
        message: "categoryId, amount and trnDate are required.",
      });
    }

    // 🔄 Get DB connection for transactional operations
    const conn = await db.getConnection();

    try {
      /**
       * 🔐 Begin DB transaction
       * Ensures:
       * - Transaction update
       * - Attachment delete
       * - Attachment insert
       * all succeed together or fail together
       */
      conn.beginTransaction();

      // ✏️ Update transaction (user-safe update)
      const [result] = await db.query(
        `
      UPDATE transactions
      SET 
        category_id = ?,    -- Updated category
        amount = ?,         -- Updated amount
        note = ?,           -- Updated note
        trn_date = ?        -- Updated date
      WHERE trn_id = ?
        AND user_id = ?     -- Prevent updating others' data
      `,
        [categoryId, amount, note || null, trnDate, trnId, userId]
      );

      // ❌ No record found
      if (result.affectedRows === 0) {
        return sendError(res, {
          statusCode: 404,
          message: "Transaction not found.",
        });
      }

      /**
       * 🗑️ Delete selected attachments (if provided)
       * Steps:
       * 1. Fetch file paths
       * 2. Delete physical files from disk
       * 3. Delete DB records
       */
      if (deleteAttachmentIds.length > 0) {
        const [filesPath] = await db.query(
          `
            SELECT file_path
            FROM transaction_attachments
            WHERE trn_id = ? and attachment_id IN (?)
          `,
          [trnId, deleteAttachmentIds]
        );

        console.log(filesPath);

        // 🧹 Remove files from filesystem
        for (const f of filesPath) {
          if (fs.existsSync(f.file_path)) {
            fs.unlinkSync(f.file_path);
          }
        }

        // 🗑️ Remove attachment records from DB
        await db.query(
          `
            DELETE FROM transaction_attachments
            WHERE trn_id = ? and attachment_id IN (?)
          `,
          [trnId, deleteAttachmentIds]
        );
      }

      /**
       * 3️⃣ Add new attachments (if uploaded)
       * - Files already stored by Multer
       * - Only DB insertion happens here
       */
      if (req.files && req.files.length > 0) {
        const values = req.files.map((file) => [
          trnId,
          file.originalname,
          file.path,
          file.mimetype,
          file.size,
        ]);

        await conn.query(
          `
          INSERT INTO transaction_attachments
          (trn_id, file_name, file_path, file_type, file_size)
          VALUES ?
          `,
          [values]
        );
      }

      // ✅ COMMIT ONLY IF EVERYTHING PASSES
      await conn.commit();

      // ✅ Success response
      return sendSuccess(res, {
        statusCode: 200,
        message: "Transaction updated successfully.",
      });
    } catch (err) {
      // ❌ ROLLBACK EVERYTHING on any failure
      await conn.rollback();

      /**
       * 🧹 Cleanup uploaded files
       * Ensures no orphan files remain if DB operation fails
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
      // 🔚 Release DB connection
      conn.release();
    }
  }
);

/**
 * @route   DELETE /transactions/delete
 * @desc    Delete a transaction
 * @access  Private
 */
router.delete("/delete", authenticationToken, async (req, res) => {
  const userId = req.userId;

  // 📥 Transaction ID from query
  const { trnId } = req.query;

  const conn = await db.getConnection();

  try {
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
      [trnId]
    );

    // 🗑️ Delete transaction safely (ownership enforced)
    const [result] = await db.query(
      `
      DELETE FROM transactions
      WHERE user_id = ? AND trn_id = ?
      `,
      [userId, trnId]
    );

    // ❌ Not found
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

    await conn.commit();

    // ✅ Success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Transaction deleted successfully.",
    });
  } catch (err) {
    await conn.rollback();

    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  } finally {
    conn.release();
  }
});

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
