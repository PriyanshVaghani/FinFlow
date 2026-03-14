// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
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
router.get("/", authenticationToken, async (req, res, next) => {
  try {
    // 📥 Extract query params & user ID
    const { type } = req.query;
    const userId = req.userId;

    // 1️⃣ Validate required query params
    if (!type) {
      return next({
        statusCode: 422, // Unprocessable Entity
        message: "Category type is required",
      });
    }

    // 2️⃣ Fetch categories via service
    const rows = await getCategories(type, userId);

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  } catch (err) {
    // ❌ Handle unexpected server errors
    next(err);
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
router.post("/add", authenticationToken, async (req, res, next) => {
  try {
    // 📥 Extract request body
    const { name, type } = req.body;
    const userId = req.userId;

    // 1️⃣ Validate required fields
    if (!name || !type) {
      return next({
        statusCode: 422, // Unprocessable Entity
        message: "Category name and type are required",
      });
    }

    // 2️⃣ Add category via service
    const data = await addCategory(name, type, userId);

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 201, // Created
      message: "Category created successfully",
      data,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next({
        statusCode: 409, // Conflict
        message: "You already have a category with this name and type",
      });
    }

    // ❌ Handle unexpected server errors
    next(err);
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
router.put("/update", authenticationToken, async (req, res, next) => {
  try {
    // 📥 Extract request body
    const { categoryId, name } = req.body;
    const userId = req.userId;

    // 1️⃣ Validate required fields
    if (!categoryId || !name) {
      return next({
        statusCode: 422,
        message: "Category ID and name are required",
      });
    }

    // 2️⃣ Update category via service
    await updateCategory(categoryId, name, userId);

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Category updated successfully",
    });
  } catch (err) {
    next(err);
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
router.delete("/delete", authenticationToken, async (req, res, next) => {
  try {
    // 📥 Extract query params
    const { categoryId } = req.query;
    const userId = req.userId;

    // 1️⃣ Validate required params
    if (!categoryId) {
      return next({
        statusCode: 422,
        message: "Category ID is required",
      });
    }

    // 2️⃣ Delete category via service
    await deleteCategory(categoryId, userId);

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "Category deleted successfully",
    });
  } catch (err) {
    next(err);
  }
});

// =======================================
// 📦 Export Router
// =======================================
module.exports = router;
