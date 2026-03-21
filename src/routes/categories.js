// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware

// ✅ Category request validators
const {
  validateGetCategories,
  validateAddCategory,
  validateUpdateCategory,
  validateDeleteCategory,
} = require("../validators/categories.validator");

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
 * @desc    Retrieve all categories by type (user + default)
 * @access  Private
 * @query   type
 *
 * Notes:
 * - Returns user-created categories
 * - Also returns default system categories (user_id IS NULL)
 */
router.get(
  "/",
  authenticationToken,
  validateGetCategories,
  async (req, res, next) => {
    try {
      // 📥 Extract query params and user ID
      const { type } = req.query;
      const userId = req.userId;

      // 📂 Fetch categories via service
      const rows = await getCategories(type, userId);

      // 📤 Send success response
      return sendSuccess(res, {
        statusCode: 200,
        data: rows,
      });
    } catch (err) {
      // ❌ Forward unexpected errors to global error handler
      next(err);
    }
  },
);

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
router.post(
  "/add",
  authenticationToken,
  validateAddCategory,
  async (req, res, next) => {
    try {
      // 📥 Extract request body
      const { name, type } = req.body;
      const userId = req.userId;

      // 📂 Add category via service
      const data = await addCategory(name, type, userId);

      // 📤 Send success response
      return sendSuccess(res, {
        statusCode: 201, // Created
        message: "Category created successfully",
        data,
      });
    } catch (err) {
      // ⚠️ Handle duplicate category entry
      if (err.code === "ER_DUP_ENTRY") {
        return next({
          statusCode: 409, // Conflict
          message: "You already have a category with this name and type",
        });
      }

      // ❌ Forward unexpected errors
      next(err);
    }
  },
);

/**
 * ======================================================
 * ✏️ UPDATE CATEGORY
 * ======================================================
 * @route   PUT /categories/update
 * @desc    Update category name
 * @access  Private
 */
router.put(
  "/update",
  authenticationToken,
  validateUpdateCategory,
  async (req, res, next) => {
    try {
      // 📥 Extract query params and request body
      const { categoryId } = req.query;
      const { name } = req.body;
      const userId = req.userId;

      // 📂 Update category via service
      await updateCategory(categoryId, name, userId);

      // 📤 Send success response
      return sendSuccess(res, {
        statusCode: 200,
        message: "Category updated successfully",
      });
    } catch (err) {
      // ❌ Forward unexpected errors
      next(err);
    }
  },
);

/**
 * ======================================================
 * 🗑️ DELETE CATEGORY (SOFT DELETE)
 * ======================================================
 * @route   DELETE /categories/delete
 * @desc    Delete category (soft delete)
 * @access  Private
 * @query   categoryId
 */
router.delete(
  "/delete",
  authenticationToken,
  validateDeleteCategory,
  async (req, res, next) => {
    try {
      // 📥 Extract query params
      const { categoryId } = req.query;
      const userId = req.userId;

      // 📂 Delete category via service
      await deleteCategory(categoryId, userId);

      // 📤 Send success response
      return sendSuccess(res, {
        statusCode: 200,
        message: "Category deleted successfully",
      });
    } catch (err) {
      // ❌ Forward unexpected errors
      next(err);
    }
  },
);

// =======================================
// 📦 Export Router
// =======================================
module.exports = router;
