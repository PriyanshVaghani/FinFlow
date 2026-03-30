// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();

const upload = require("../middleware/upload"); // 📎 Multer upload configuration

// ✅ Transaction request validators
const {
  validateAddTransaction,
  validateUpdateTransaction,
  validateDeleteTransaction,
  validateAddRecurringTransaction,
  validateUpdateRecurringTransaction,
} = require("../validators/transaction.validator");

// 📅 Date validation utility
const { isValidISODate } = require("../utils/validation");

const asyncHandler = require("../utils/asyncHandler"); // 🔁 Handles async errors (removes try-catch)

const {
  fetchTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getRecurringTransactions,
  addRecurringTransaction,
  updateRecurringTransaction,
} = require("../services/transaction.service"); // 📊 Transaction service

// 🔐 JWT authentication middleware
const { authenticationToken } = require("../middleware/auth_middleware"); // 🔑 Verifies access token & extracts userId

// 📤 Standard API response helpers
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📦 Unified API success & error responses

/**
 * ======================================================
 * 📥 GET /transactions
 * ======================================================
 * @route   GET /api/transactions
 * @desc    Fetch paginated & filtered transactions of the logged-in user
 * @access  Private (JWT protected)
 *
 *
 * Architecture Flow:
 * Controller (this file)
 *    ↓
 * Service Layer (fetchTransactions)
 *    ↓
 * Database
 *
 * Query Params:
 * - skip (optional) → Number of records to skip (default: 0)
 * - take (optional) → Number of records to return (default: 10)
 *
 * Filtering Params (optional):
 * - startDate (YYYY-MM-DD)
 * - endDate (YYYY-MM-DD)
 * - categoryIds (single or multiple)
 * - type (income | expense)
 * - minAmount
 * - maxAmount
 * - search (matches note or category name)
 * 
 * Flow:
 * - Validate and sanitize all filter, pagination, and sorting parameters from the request query.
 * - Construct a dynamic base URL for attachment links.
 * - Fetch transactions via service, passing all validated parameters and the base URL.
 * - The service handles complex SQL generation for filtering and sorting.
 * - Send success response with transaction data and pagination metadata (totalCount, hasMore).
 */
/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get all transactions
 *     description: Fetch paginated & filtered transactions of the logged-in user
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: Number of records to skip
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *         description: Number of records to return
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: "Start date (YYYY-MM-DD)"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: "End date (YYYY-MM-DD)"
 *       - in: query
 *         name: categoryIds
 *         schema:
 *           type: array
 *           items:
 *             type: integer
 *         description: Filter by one or more category IDs
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [income, expense]
 *         description: Filter by transaction type
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *         description: Filter by minimum transaction amount
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *         description: Filter by maximum transaction amount
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search keyword for transaction notes or category names
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [amount, trn_date, categoryName]
 *         description: Field to sort by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order (ascending or descending)
 *     responses:
 *       200:
 *         description: Transactions fetched successfully
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
 *                   example: "Data fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       trnId:
 *                         type: integer
 *                       amount:
 *                         type: number
 *                       note:
 *                         type: string
 *                       trnDate:
 *                         type: string
 *                         format: date
 *                       categoryId:
 *                         type: integer
 *                       categoryName:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [income, expense]
 *                       attachments:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             fileName:
 *                               type: string
 *                             filePath:
 *                               type: string
 *                             fileType:
 *                               type: string
 *                             fileSize:
 *                               type: integer
 *                             url:
 *                               type: string
 *                 skip:
 *                   type: integer
 *                   example: 0
 *                 take:
 *                   type: integer
 *                   example: 10
 *                 totalCount:
 *                   type: integer
 *                   example: 100
 *                 hasMore:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid input for filters, sorting or pagination
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.get(
  "/",
  authenticationToken,
  asyncHandler(async (req, res, next) => {
    // 👤 Authenticated user ID
    const userId = req.userId;

    // 📄 Pagination parameters
    const skip = Math.max(0, parseInt(req.query.skip) || 0);
    const take = Math.max(0, parseInt(req.query.take) || 10);

    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Validate ISO date format to prevent invalid date parsing in DB queries.
    // This avoids runtime SQL errors and inconsistent filtering.
    if (startDate && !isValidISODate(startDate)) {
      return next({
        statusCode: 400,
        message: "Invalid startDate format. Use YYYY-MM-DD",
      });
    }

    if (endDate && !isValidISODate(endDate)) {
      return next({
        statusCode: 400,
        message: "Invalid endDate format. Use YYYY-MM-DD",
      });
    }

    // Logical validation: startDate must not exceed endDate.
    // Prevents meaningless queries like future-to-past range.
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return next({
        statusCode: 400,
        message: "startDate cannot be greater than endDate",
      });
    }

    // 📂 Category filter (supports single or multiple IDs)
    let categoryIds = req.query.categoryIds;

    if (!categoryIds) {
      categoryIds = [];
    } else if (!Array.isArray(categoryIds)) {
      categoryIds = [categoryIds];
    }

    // Keep only numeric IDs.
    // This prevents SQL injection and invalid category filtering.
    categoryIds = categoryIds.filter((id) => /^\d+$/.test(id)).map(Number);

    // 🔄 Transaction type filter
    let type = req.query.type;

    if (type) {
      type = type.toLowerCase();

      // Restrict to allowed values to prevent invalid filtering logic.
      if (!["income", "expense"].includes(type)) {
        return next({
          statusCode: 400,
          message: "Invalid type. Allowed values: income, expense",
        });
      }
    }

    // 💰 Amount filters
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
        return next({
          statusCode: 400,
          message: "minAmount must be a valid number",
        });
      }
    }

    // Validate maximum amount
    if (rawMaxAmount !== undefined) {
      maxAmount = Number(rawMaxAmount);

      if (!Number.isFinite(maxAmount)) {
        return next({
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
      return next({
        statusCode: 400,
        message: "maxAmount must be greater than or equal to minAmount",
      });
    }

    // 🔍 Search filter
    let search = req.query.search;

    if (search !== undefined) {
      if (typeof search !== "string") {
        return next({
          statusCode: 400,
          message: "Search must be a string",
        });
      }

      search = search.trim();

      // Prevent overly long search inputs.
      // Protects performance and avoids abuse (e.g., extremely long LIKE queries).
      if (search.length > 100) {
        return next({
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
      return next({
        statusCode: 400,
        message: "Invalid sort field",
      });
    }

    if (!allowedOrders.includes(order.toLowerCase())) {
      return next({
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

    // Delegate filtering, sorting, pagination to service layer.
    // Keeps controller thin and maintains separation of concerns.
    const result = await fetchTransactions(userId, {
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
  }),
);

/**
 * ======================================================
 * 📤 POST /transactions/add
 * ======================================================
 * @route   POST /api/transactions/add
 * @desc    Add a new transaction with optional attachments
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Handle file uploads via Multer middleware, which validates file size and type.
 * - Validate text fields (categoryId, amount, trnDate) via middleware.
 * - Add transaction via service, which manages the database transaction and file handling.
 * - The service detects and discards duplicate file uploads for the same transaction.
 * - Send success response.
 */
/**
 * @swagger
 * /api/transactions/add:
 *   post:
 *     summary: Add a new transaction
 *     description: Add a new transaction with optional attachments
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - categoryId
 *               - amount
 *               - trnDate
 *             properties:
 *               categoryId:
 *                 type: integer
 *                 example: 1
 *               amount:
 *                 type: number
 *                 example: 500
 *               note:
 *                 type: string
 *                 example: "Grocery shopping"
 *               trnDate:
 *                 type: string
 *                 description: "Transaction date (YYYY-MM-DD)"
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Max 5 files (JPG, PNG, PDF), Max 5MB each
 *     responses:
 *       201:
 *         description: Transaction added successfully
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
 *                   example: Transaction added successfully
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

  validateAddTransaction,

  /**
   * 🧠 MAIN CONTROLLER LOGIC
   */
  asyncHandler(async (req, res) => {
    // 🔐 Logged-in user ID (set by authenticationToken middleware)
    const userId = req.userId;

    // 📥 Extract form fields (sent as multipart/form-data text fields)
    const { categoryId, amount, note, trnDate } = req.body;

    await addTransaction(
      userId,
      { categoryId, amount, note, trnDate },
      req.files,
    );
    return sendSuccess(res, {
      statusCode: 201,
      message: "Transaction added successfully",
    });
  }),
);

/**
 * ==========================================
 * ✏️ UPDATE TRANSACTION API
 * ==========================================
 * @route   PUT /api/transactions/update
 * @desc    Partially update a transaction and/or attachments
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Handle new file uploads via Multer middleware.
 * - Validate query param (trnId) and optional body fields via middleware.
 * - Update transaction via service, which verifies ownership and performs a partial update.
 * - The service can add new attachments and delete existing ones by ID in the same operation.
 * - Send success response.
 */
/**
 * @swagger
 * /api/transactions/update:
 *   put:
 *     summary: Update transaction
 *     description: Partially update a transaction and/or attachments
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: trnId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId:
 *                 type: integer
 *               amount:
 *                 type: number
 *               note:
 *                 type: string
 *               trnDate:
 *                 type: string
 *                 description: "Transaction date (YYYY-MM-DD)"
 *               deleteAttachmentIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of attachment IDs to delete
 *               attachments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: New files to attach
 *     responses:
 *       200:
 *         description: Transaction updated successfully
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
 *                   example: Transaction updated successfully
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

  validateUpdateTransaction,

  /**
   * ==========================================
   * 🧠 MAIN CONTROLLER LOGIC (partial update)
   * ==========================================
   * - Only provided transaction fields are updated
   * - Optional: add new attachments, remove by attachment IDs
   * ==========================================
   */
  asyncHandler(async (req, res) => {
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

    await updateTransaction(
      userId,
      trnId,
      { categoryId, amount, note, trnDate, deleteAttachmentIds },
      req.files,
    );
    return sendSuccess(res, {
      statusCode: 200,
      message: "Transaction updated successfully",
    });
  }),
);

/**
 * ======================================================
 * 🗑️ DELETE TRANSACTION
 * ======================================================
 * @route   DELETE /api/transactions/delete
 * @desc    Delete a transaction and its attachments
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (trnId) via middleware.
 * - Delete transaction via service, which verifies ownership.
 * - The service also deletes all associated attachment records and their physical files from the disk.
 * - Send success response.
 */
/**
 * @swagger
 * /api/transactions/delete:
 *   delete:
 *     summary: Delete a transaction
 *     description: Delete a transaction and its attachments
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: trnId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaction deleted successfully
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
 *                   example: Transaction deleted successfully
 */
router.delete(
  "/delete",
  authenticationToken,
  validateDeleteTransaction,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Transaction ID from query
    const { trnId } = req.query;

    await deleteTransaction(userId, trnId);
    return sendSuccess(res, {
      statusCode: 200,
      message: "Transaction deleted successfully",
    });
  }),
);

/**
 * ======================================================
 * 🔁 GET ALL RECURRING TRANSACTIONS (WITH CATEGORY)
 * ======================================================
 * @route   GET /api/transactions/recurring
 * @desc    Fetch recurring transactions with category details
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Fetch all recurring transactions for the logged-in user via service.
 * - The service joins category details to each recurring transaction.
 * - Send success response with the list of recurring transactions.
 */
/**
 * @swagger
 * /api/transactions/recurring:
 *   get:
 *     summary: Get recurring transactions
 *     description: Fetch recurring transactions with category details
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Recurring transactions fetched successfully
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
 *                   example: "Data fetched successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       recurring_id:
 *                         type: integer
 *                       amount:
 *                         type: number
 *                       note:
 *                         type: string
 *                       frequency:
 *                         type: string
 *                         enum: [Daily, Weekly, Monthly, Yearly]
 *                       start_date:
 *                         type: string
 *                         format: date
 *                       end_date:
 *                         type: string
 *                         format: date
 *                         nullable: true
 *                       is_active:
 *                         type: boolean
 *                       category_id:
 *                         type: integer
 *                       categoryName:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [income, expense]
 */
router.get(
  "/recurring",
  authenticationToken,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID
    const userId = req.userId;

    const rows = await getRecurringTransactions(userId);
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  }),
);

/**
 * ======================================================
 * 🔁 ADD RECURRING TRANSACTION
 * ======================================================
 * @route   POST /api/transactions/recurring/add
 * @desc    Create a recurring expense
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate request body fields (categoryId, amount, frequency, etc.) via middleware.
 * - Add recurring transaction via service.
 * - Send success response.
 */
/**
 * @swagger
 * /api/transactions/recurring/add:
 *   post:
 *     summary: Add recurring transaction
 *     description: Create a recurring expense
 *     tags: [Transactions]
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
 *               - amount
 *               - frequency
 *               - startDate
 *             properties:
 *               categoryId:
 *                 type: integer
 *                 example: 1
 *               amount:
 *                 type: number
 *                 example: 1000
 *               note:
 *                 type: string
 *                 example: "Netflix Subscription"
 *               frequency:
 *                 type: string
 *                 enum: [Daily, Weekly, Monthly, Yearly]
 *                 example: Monthly
 *               startDate:
 *                 type: string
 *                 description: "Start date (YYYY-MM-DD)"
 *               endDate:
 *                 type: string
 *                 description: "End date (YYYY-MM-DD), optional"
 *     responses:
 *       201:
 *         description: Recurring expense added successfully
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
 *                   example: Recurring expense added successfully
 */
router.post(
  "/recurring/add",
  authenticationToken,
  validateAddRecurringTransaction,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Extract request body
    const { categoryId, amount, note, frequency, startDate, endDate } =
      req.body;

    await addRecurringTransaction(userId, {
      categoryId,
      amount,
      note,
      frequency,
      startDate,
      endDate,
    });
    return sendSuccess(res, {
      statusCode: 201,
      message: "Recurring expense added successfully",
    });
  }),
);

/**
 * ======================================================
 * 🔁 UPDATE RECURRING TRANSACTION (Details + Status)
 * ======================================================
 * @route   PUT /api/transactions/recurring/update
 * @desc    Update recurring expense details or status
 * @access  Private (JWT protected)
 *
 * Flow:
 * - Validate query param (recurringId) and optional body fields via middleware.
 * - Update recurring transaction via service, which verifies ownership and performs a partial update.
 * - Send success response.
 */
/**
 * @swagger
 * /api/transactions/recurring/update:
 *   put:
 *     summary: Update recurring transaction
 *     description: Update recurring expense details or status
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: recurringId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId:
 *                 type: integer
 *               amount:
 *                 type: number
 *               note:
 *                 type: string
 *               frequency:
 *                 type: string
 *                 enum: [Daily, Weekly, Monthly, Yearly]
 *               startDate:
 *                 type: string
 *                 description: "Start date (YYYY-MM-DD)"
 *               endDate:
 *                 type: string
 *                 description: "End date (YYYY-MM-DD), optional"
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Recurring expense updated successfully
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
 *                   example: Recurring expense updated successfully
 */
router.put(
  "/recurring/update",
  authenticationToken,
  validateUpdateRecurringTransaction,
  asyncHandler(async (req, res) => {
    // 👤 Logged-in user ID
    const userId = req.userId;

    // 📥 Recurring ID from query
    const { recurringId } = req.query;

    // 📥 Request body fields
    const {
      categoryId,
      amount,
      note,
      frequency,
      startDate,
      endDate,
      isActive,
    } = req.body;

    await updateRecurringTransaction(userId, recurringId, {
      categoryId,
      amount,
      note,
      frequency,
      startDate,
      endDate,
      isActive,
    });
    return sendSuccess(res, {
      statusCode: 200,
      message: "Recurring expense updated successfully",
    });
  }),
);

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
