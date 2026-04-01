// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API response helpers
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔐 JWT authentication middleware
const asyncHandler = require("../utils/asyncHandler"); // 🔁 Handles async errors (removes try-catch)

// ✅ Budget request validators
const {
  validateGetBudgets,
  validateAddBudget,
  validateUpdateBudget,
  validateDeleteBudget,
  validateBudgetAnalytics,
} = require("../validators/budgets.validator");

const {
  getBudgets,
  addBudget,
  updateBudget,
  deleteBudget,
  getBudgetAnalytics,
} = require("../services/budgets.service"); // 📂 Budget services

/**
 * ======================================================
 * 📌 TAG: Budget APIs
 * ======================================================
 */

/**
 * ======================================================
 * 📥 GET /budgets
 * ======================================================
 * @route   GET /api/budgets
 * @desc    Fetch budgets for a specific month along with calculated spent amount per category
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate month input via middleware.
 * - Fetch budgets for the logged-in user via service.
 * - Service calculates total spent amount per category.
 * - Send success response with budget data.
 */
/**
 * @swagger
 * /api/budgets:
 *   get:
 *     summary: Get budgets by month
 *     description: Fetch all budgets for a specific month with spent amount
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *         description: "Month to fetch budgets for (YYYY-MM)"
 *     responses:
 *       200:
 *         description: Budgets fetched successfully
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
 *                       budget_id:
 *                         type: integer
 *                       month:
 *                         type: string
 *                       budgetAmount:
 *                         type: number
 *                       category_id:
 *                         type: integer
 *                       categoryName:
 *                         type: string
 *                       spentAmount:
 *                         type: number
 */
router.get(
  "/",
  authenticationToken,
  validateGetBudgets,
  asyncHandler(async (req, res) => {
    // 📥 Extract month from query string
    const { month } = req.query;

    // 👤 Logged-in user ID (provided by authentication middleware)
    const userId = req.userId;

    // 📂 Fetch budgets via service
    const rows = await getBudgets(userId, month);

    // 📤 Return formatted success response
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  }),
);

/**
 * ======================================================
 * ➕ POST /budgets/add
 * ======================================================
 * @route   POST /api/budgets/add
 * @desc    Create a new monthly budget
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate request body (categoryId, month, amount) via middleware.
 * - Add budget via service, which ensures category is a valid expense type and prevents duplicates.
 * - Send success response with new budget ID.
 */
/**
 * @swagger
 * /api/budgets/add:
 *   post:
 *     summary: Create new budget
 *     description: Add a new monthly budget for a category
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - categoryId
 *               - month
 *               - amount
 *             properties:
 *               categoryId:
 *                 type: integer
 *                 example: 1
 *               month:
 *                 type: string
 *                 example: 2026-02
 *               amount:
 *                 type: number
 *                 example: 5000
 *     responses:
 *       201:
 *         description: Budget created successfully
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
 *                   example: Budget created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     budgetId:
 *                       type: integer
 *       409:
 *         description: Budget already exists
 */
router.post(
  "/add",
  authenticationToken,
  validateAddBudget,
  asyncHandler(async (req, res) => {
    const { categoryId, month, amount } = req.body;
    const userId = req.userId; // 👤 Extracted from JWT

    // 📂 Add budget via service
    const data = await addBudget(userId, categoryId, month, amount);

    return sendSuccess(res, {
      statusCode: 201,
      message: "Budget created successfully",
      data,
    });
  }),
);

/**
 * ======================================================
 * ✏️ PUT /budgets/update
 * ======================================================
 * @route   PUT /api/budgets/update
 * @desc    Update an existing budget (Partial update supported)
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (budgetId) and optional body fields via middleware.
 * - Update budget via service, which verifies ownership and performs a partial update.
 * - Send success response.
 */
/**
 * @swagger
 * /api/budgets/update:
 *   put:
 *     summary: Update budget
 *     description: Update an existing budget (partial update supported)
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: budgetId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the budget to update
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId:
 *                 type: integer
 *                 example: 2
 *               month:
 *                 type: string
 *                 example: 2026-03
 *               amount:
 *                 type: number
 *                 example: 6000
 *     responses:
 *       200:
 *         description: Budget updated successfully
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
 *                   example: Budget updated successfully
 */
router.put(
  "/update",
  authenticationToken,
  validateUpdateBudget,
  asyncHandler(async (req, res) => {
    const { budgetId } = req.query;
    const userId = req.userId;
    const { categoryId, month, amount } = req.body;

    // 📂 Update budget via service
    await updateBudget(userId, budgetId, { categoryId, month, amount });

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget updated successfully",
    });
  }),
);

/**
 * ======================================================
 * 🗑️ DELETE /budgets/delete
 * ======================================================
 * @route   DELETE /api/budgets/delete
 * @desc    Delete a budget record
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (budgetId) via middleware.
 * - Delete budget via service, which verifies ownership.
 * - Send success response.
 */
/**
 * @swagger
 * /api/budgets/delete:
 *   delete:
 *     summary: Delete budget
 *     description: Delete a budget by ID
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: budgetId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the budget to delete
 *     responses:
 *       200:
 *         description: Budget deleted successfully
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
 *                   example: Budget deleted successfully
 */
router.delete(
  "/delete",
  authenticationToken,
  validateDeleteBudget,
  asyncHandler(async (req, res) => {
    const { budgetId } = req.query;
    const userId = req.userId;

    // 📂 Delete budget via service
    await deleteBudget(userId, budgetId);

    return sendSuccess(res, {
      statusCode: 200,
      message: "Budget deleted successfully",
    });
  }),
);

/**
 * ======================================================
 * 📊 GET /analytics
 * ======================================================
 * @route   GET /api/budgets/analytics
 * @desc    Fetch monthly budget analytics for a specific month
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (month) via middleware.
 * - Fetch analytics data via service, which calculates budget vs. spending, totals, and percentages.
 * - Send success response with structured analytics data.
 */
/**
 * @swagger
 * /api/budgets/analytics:
 *   get:
 *     summary: Budget analytics
 *     description: Get monthly analytics (budget vs spending)
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *         description: "Month to fetch analytics for (YYYY-MM)"
 *     responses:
 *       200:
 *         description: Analytics fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                   example: false
 *                 data:
 *                   type: object
 *                   properties:
 *                     month:
 *                       type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalBudgetAllocated:
 *                           type: number
 *                         totalSpent:
 *                           type: number
 *                         totalRemaining:
 *                           type: number
 *                         overallPercentageUsed:
 *                           type: number
 *                         overBudgetCategoriesCount:
 *                           type: integer
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           budgetId:
 *                             type: integer
 *                           categoryId:
 *                             type: integer
 *                           categoryName:
 *                             type: string
 *                           budgetAmount:
 *                             type: number
 *                           spentAmount:
 *                             type: number
 *                           remainingAmount:
 *                             type: number
 *                           percentageUsed:
 *                             type: number
 *                           isOverBudget:
 *                             type: boolean
 *                           overAmount:
 *                             type: number
 *                           status:
 *                             type: string
 */
router.get(
  "/analytics",
  authenticationToken,
  validateBudgetAnalytics,
  asyncHandler(async (req, res) => {
    // 📥 Extract month from query params
    const { month } = req.query;

    // 👤 Logged-in user ID (provided by JWT middleware)
    const userId = req.userId;

    const data = await getBudgetAnalytics(userId, month);

    return sendSuccess(res, {
      statusCode: 200,
      data,
    });
  }),
);

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
