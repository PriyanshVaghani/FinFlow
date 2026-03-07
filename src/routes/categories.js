// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
const {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
} = require("../services/categories.service"); // 📂 Category services

/**
 * ======================================================
 * 📂 GET CATEGORIES
 * ======================================================
 * @route   GET /categories
 * @desc    Get all categories by type (user + default)
 * @access  Private
 * @query   type
 *
 * Notes:
 * - Returns user-created categories
 * - Also returns default system categories (user_id IS NULL)
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
    // 2️⃣ Fetch categories via service
    const rows = await getCategories(type, userId);

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
 * ======================================================
 * ➕ ADD CATEGORY
 * ======================================================
 * @route   POST /categories/add
 * @desc    Create a new category
 * @access  Private
 *
 * Rules:
 * - Only Income / Expense types allowed
 * - Prevents duplication of default categories
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

  try {
    // 2️⃣ Add category via service
    const data = await addCategory(name, type, userId);

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 201, // Created
      message: "Category created successfully",
      data,
    });
  } catch (err) {
    // ✅ Handle specific error cases
    if (err.message === "Invalid category type") {
      return sendError(res, {
        statusCode: 422,
        message: err.message,
      });
    }

    if (err.message === "This category already exists as a default category") {
      return sendError(res, {
        statusCode: 409,
        message: err.message,
      });
    }

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
 * ======================================================
 * ✏️ UPDATE CATEGORY
 * ======================================================
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
    // 2️⃣ Update category via service
    await updateCategory(categoryId, name, userId);

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Category updated successfully",
    });
  } catch (err) {
    // ❌ Handle specific error cases
    if (err.message === "Category not found or unauthorized") {
      return sendError(res, {
        statusCode: 404, // Not Found
        message: err.message,
      });
    }

    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * 🗑️ DELETE CATEGORY (SOFT DELETE)
 * ======================================================
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
    // 2️⃣ Delete category via service
    await deleteCategory(categoryId, userId);

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Category deleted successfully",
    });
  } catch (err) {
    // ❌ Handle specific error cases
    if (err.message === "Category not found or unauthorized") {
      return sendError(res, {
        statusCode: 404,
        message: err.message,
      });
    }

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
