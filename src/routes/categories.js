// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const db = require("../config/db"); // ✅ MySQL DB connection (promise-based)
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware

/**
 * @route   GET /categories
 * @desc    Get all categories by type (user + default)
 * @access  Private
 * @query   type
 */
router.get("/", authenticationToken, async (req, res) => {
  // 📥 Extract query params & user ID
  const { type } = req.query;
  const userId = req.userId;

  // 1️⃣ Validate required query params
  if (!type) {
    return sendError(res, {
      statusCode: 422, // Unprocessable Entity
      message: "Category type is required",
    });
  }

  try {
    // 2️⃣ Fetch categories
    // - Includes user's own categories
    // - Includes predefined system categories (user_id IS NULL)
    const [rows] = await db.query(
      `
      SELECT
        category_id,
        name,
        JSON_EXTRACT(
          CASE
            WHEN is_active = 1 THEN 'true'
            ELSE 'false'
          END,
          '$'
        ) AS isActive
      FROM categories
      WHERE type = ?
        AND (user_id = ? OR user_id IS NULL)
      `,
      [type, userId]
    );

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  } catch (err) {
    // ❌ Handle unexpected server errors
    return sendError(res, {
      statusCode: 500, // Internal Server Error
      message: err.message,
    });
  }
});

/**
 * @route   POST /categories/add
 * @desc    Create a new category
 * @access  Private
 */
router.post("/add", authenticationToken, async (req, res) => {
  // 📥 Extract request body
  const { name, type } = req.body;
  const userId = req.userId;

  // 1️⃣ Validate required fields
  if (!name || !type) {
    return sendError(res, {
      statusCode: 422, // Unprocessable Entity
      message: "Category name and type are required",
    });
  }

  const ALLOWED_TYPES = ["Income", "Expense"];

  if (!ALLOWED_TYPES.includes(type)) {
    return sendError(res, {
      statusCode: 422,
      message: "Invalid category type",
    });
  }

  try {
    // Prevent user from adding default category name
    const [existing] = await db.query(
      `
        SELECT category_id FROM categories
        WHERE name = ? AND type = ? AND user_id IS NULL AND is_active = 1
      `,
      [name.trim(), type]
    );

    if (existing.length > 0) {
      return sendError(res, {
        statusCode: 409,
        message: "This category already exists as a default category",
      });
    }

    // 2️⃣ Insert new category for the logged-in user
    const [result] = await db.query(
      `
      INSERT INTO categories (name, type, user_id)
      VALUES (?, ?, ?)
      `,
      [name.trim(), type, userId]
    );

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 201, // Created
      message: "Category created successfully",
      data: {
        categoryId: result.insertId,
      },
    });
  } catch (err) {
    // ✅ Check for MySQL duplicate entry error
    if (err.code === "ER_DUP_ENTRY") {
      return sendError(res, {
        statusCode: 409, // Conflict
        message: "You already have a category with this name and type",
      });
    }

    // ❌ Handle unexpected server errors
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * @route   PUT /categories/update
 * @desc    Update category name
 * @access  Private
 */
router.put("/update", authenticationToken, async (req, res) => {
  // 📥 Extract request body
  const { categoryId, name } = req.body;
  const userId = req.userId;

  // 1️⃣ Validate required fields
  if (!categoryId || !name) {
    return sendError(res, {
      statusCode: 422,
      message: "Category ID and name are required",
    });
  }

  try {
    // 2️⃣ Update category (only user's active categories)
    const [result] = await db.query(
      `
      UPDATE categories
      SET name = ?
      WHERE category_id = ?
        AND user_id = ?
        AND is_active = 1
      `,
      [name.trim(), categoryId, userId]
    );

    // 3️⃣ Check if update was successful
    if (result.affectedRows === 0) {
      return sendError(res, {
        statusCode: 404, // Not Found
        message: "Category not found or unauthorized",
      });
    }

    // 4️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Category updated successfully",
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
 * @route   DELETE /categories/delete
 * @desc    Delete category (soft delete)
 * @access  Private
 * @query   categoryId
 */
router.delete("/delete", authenticationToken, async (req, res) => {
  // 📥 Extract query params
  const { categoryId } = req.query;
  const userId = req.userId;

  // 1️⃣ Validate required params
  if (!categoryId) {
    return sendError(res, {
      statusCode: 422,
      message: "Category ID is required",
    });
  }

  try {
    // 2️⃣ Soft delete category (mark inactive)
    const [result] = await db.query(
      `
      UPDATE categories
      SET is_active = 0
      WHERE category_id = ?
        AND user_id = ?
      `,
      [categoryId, userId]
    );

    // 3️⃣ Check if delete was successful
    if (result.affectedRows === 0) {
      return sendError(res, {
        statusCode: 404,
        message: "Category not found or unauthorized",
      });
    }

    // 4️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Category deleted successfully",
    });
  } catch (err) {
    // ❌ Handle unexpected server errors
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

// =======================================
// 📦 Export Router
// =======================================
module.exports = router;
