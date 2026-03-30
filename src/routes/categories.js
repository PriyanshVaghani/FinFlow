// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
const asyncHandler = require("../utils/asyncHandler"); // 🔁 Handles async errors (removes try-catch)

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
 * 📌 TAG: Category APIs
 * ======================================================
 */

/**
 * ======================================================
 * 📂 GET CATEGORIES
 * ======================================================
 * @route   GET /api/categories
 * @desc    Retrieve all categories by type (user + default)
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (type) via middleware.
 * - Fetch categories via service, which includes user-specific and default system categories.
 * - Send success response with category data.
 */
/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get categories
 *     description: Retrieve all categories (user + default) filtered by type
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Income, Expense]
 *           example: Expense
 *         description: Filter categories by Income or Expense
 *     responses:
 *       200:
 *         description: Categories fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       category_id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [Income, Expense]
 */
router.get(
  "/",
  authenticationToken,
  validateGetCategories,
  asyncHandler(async (req, res) => {
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
  }),
);

/**
 * ======================================================
 * ➕ ADD CATEGORY
 * ======================================================
 * @route   POST /api/categories/add
 * @desc    Create a new category
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate request body (name, type) via middleware.
 * - Add category via service, which prevents duplicates for the user.
 * - Send success response with new category ID.
 */
/**
 * @swagger
 * /api/categories/add:
 *   post:
 *     summary: Create category
 *     description: Add a new category (Income or Expense)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *             properties:
 *               name:
 *                 type: string
 *                 example: Food
 *               type:
 *                 type: string
 *                 enum: [Income, Expense]
 *                 example: Expense
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Category created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     categoryId:
 *                       type: integer
 *       409:
 *         description: Category already exists
 */
router.post(
  "/add",
  authenticationToken,
  validateAddCategory,
  asyncHandler(async (req, res) => {
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
  }),
);

/**
 * ======================================================
 * ✏️ UPDATE CATEGORY
 * ======================================================
 * @route   PUT /api/categories/update
 * @desc    Update category name
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (categoryId) and body (name) via middleware.
 * - Update category via service, which verifies ownership.
 * - Send success response.
 */
/**
 * @swagger
 * /api/categories/update:
 *   put:
 *     summary: Update category
 *     description: Update category name
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the category to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Groceries
 *     responses:
 *       200:
 *         description: Category updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Category updated successfully
 */
router.put(
  "/update",
  authenticationToken,
  validateUpdateCategory,
  asyncHandler(async (req, res) => {
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
  }),
);

/**
 * ======================================================
 * 🗑️ DELETE CATEGORY (SOFT DELETE)
 * ======================================================
 * @route   DELETE /api/categories/delete
 * @desc    Delete category (soft delete)
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (categoryId) via middleware.
 * - Soft delete category via service, which verifies ownership and sets `is_active` to false.
 * - Send success response.
 */
/**
 * @swagger
 * /api/categories/delete:
 *   delete:
 *     summary: Delete category
 *     description: Soft delete category by ID
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the category to delete
 *     responses:
 *       200:
 *         description: Category deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Category deleted successfully
 */
router.delete(
  "/delete",
  authenticationToken,
  validateDeleteCategory,
  asyncHandler(async (req, res) => {
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
  }),
);

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
