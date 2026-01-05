// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const db = require("../config/db");

// 🔐 JWT authentication middleware
const { authenticationToken } = require("../middleware/auth_middleware");

// 📤 Standard API response helpers
const { sendSuccess, sendError } = require("../utils/responseHelper");

/**
 * @route   GET /transactions
 * @desc    Fetch all transactions of logged-in user
 * @access  Private
 */
router.get("/", authenticationToken, async (req, res) => {
  // 🔑 Extract userId from JWT middleware
  const userId = req.userId;

  try {
    // 🗂️ Fetch transactions with related category details
    const [transactions] = await db.query(
      `
      SELECT
        t.trn_id AS trnId,          -- Transaction ID
        t.amount,                  -- Transaction amount
        t.note,                    -- Optional note
        t.trn_date AS trnDate,     -- Transaction date
        c.category_id AS categoryId,
        c.name AS categoryName,
        c.type AS type             -- Income / Expense
      FROM transactions t
      JOIN categories c
        ON t.category_id = c.category_id
      WHERE t.user_id = ?
      ORDER BY t.trn_date DESC     -- Latest transactions first
      `,
      [userId]
    );

    // ✅ Send successful response
    return sendSuccess(res, {
      statusCode: 200,
      data: transactions,
    });
  } catch (err) {
    console.error(err);

    // ❌ Handle unexpected errors
    return sendError(res, {
      statusCode: 500,
      message: "Internal server error",
    });
  }
});

/**
 * @route   POST /transactions/add
 * @desc    Add a new transaction
 * @access  Private
 */
router.post("/add", authenticationToken, async (req, res) => {
  const userId = req.userId;

  // 📥 Extract request body
  const { categoryId, amount, note, trnDate } = req.body;

  // ❗ Validate required fields
  if (!categoryId || !amount || !trnDate) {
    return sendError(res, {
      statusCode: 422,
      message: "categoryId, amount and trnDate are required",
    });
  }

  try {
    // 🔎 Validate category existence and ownership
    const [category] = await db.query(
      `
      SELECT category_id
      FROM categories
      WHERE category_id = ?
        AND is_active = 1
        AND (user_id = ? OR user_id IS NULL)
      `,
      [categoryId, userId]
    );

    // ❌ Category not found or inactive
    if (category.length === 0) {
      return sendError(res, {
        statusCode: 400,
        message: "Invalid or inactive category",
      });
    }

    // ➕ Insert new transaction
    await db.query(
      `
      INSERT INTO transactions
      (user_id, category_id, amount, note, trn_date)
      VALUES (?, ?, ?, ?, ?)
      `,
      [userId, categoryId, amount, note || null, trnDate]
    );

    // ✅ Success response
    return sendSuccess(res, {
      statusCode: 201,
      message: "Transaction added successfully",
    });
  } catch (err) {
    return sendError(res, {
      statusCode: 500,
      message: "Internal server error",
    });
  }
});

/**
 * @route   PUT /transactions/update
 * @desc    Update an existing transaction
 * @access  Private
 */
router.put("/update", authenticationToken, async (req, res) => {
  const userId = req.userId;

  // 📥 Get transaction ID from query
  const { trnId } = req.query;

  // 📥 Get updated values from body
  const { categoryId, amount, note, trnDate } = req.body;

  // ❗ Validation
  if (!categoryId || !amount || !trnDate) {
    return sendError(res, {
      statusCode: 422,
      message: "categoryId, amount and trnDate are required",
    });
  }

  try {
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
        message: "Transaction not found",
      });
    }

    // ✅ Success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Transaction updated successfully",
    });
  } catch (err) {
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * @route   DELETE /transactions/delete
 * @desc    Delete a transaction
 * @access  Private
 */
router.delete("/delete", authenticationToken, async (req, res) => {
  const userId = req.userId;

  // 📥 Transaction ID from query
  const { trnId } = req.query;

  try {
    // 🗑️ Delete transaction safely
    const [result] = await db.query(
      `
      DELETE FROM transactions
      WHERE user_id = ? AND trn_id = ?
      `,
      [userId, trnId]
    );

    // ❌ Not found
    if (result.affectedRows === 0) {
      return sendError(res, {
        statusCode: 404,
        message: "Transaction not found",
      });
    }

    // ✅ Success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Transaction deleted successfully",
    });
  } catch (err) {
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
