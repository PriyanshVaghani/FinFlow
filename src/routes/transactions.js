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
 * @route   GET /transactions
 * @desc    Fetch paginated & filtered transactions of the logged-in user
 * @access  Private (JWT protected)
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
 * Sorting Params:
 * - sortBy (amount | trn_date | categoryName)
 * - order (asc | desc)
 *
 * Responsibilities:
 * - Validate & extract pagination parameters
 * - Validate filtering inputs
 * - Validate sorting inputs
 * - Construct dynamic base URL from request
 * - Delegate filtering, sorting, and pagination to service layer
 * - Return pagination metadata (totalCount, hasMore)
 */
router.get("/", authenticationToken, async (req, res, next) => {
  try {
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
  } catch (err) {
    // Catch unexpected database/runtime errors.
    // Standardized error response keeps API consistent.
    next(err);
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

  validateAddTransaction,

  /**
   * 🧠 MAIN CONTROLLER LOGIC
   */
  async (req, res, next) => {
    try {
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
    } catch (err) {
      // service already cleaned up attachments on error
      return next(err);
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

  validateUpdateTransaction,

  /**
   * ==========================================
   * 🧠 MAIN CONTROLLER LOGIC (partial update)
   * ==========================================
   * - Only provided transaction fields are updated
   * - Optional: add new attachments, remove by attachment IDs
   * ==========================================
   */
  async (req, res, next) => {
    try {
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
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ======================================================
 * 🗑️ DELETE TRANSACTION
 * ======================================================
 * @route   DELETE /transactions/delete
 * @desc    Delete a transaction and its attachments
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Delete transaction owned by logged-in user
 * - Remove related attachment files from disk
 * - Maintain DB consistency using transaction
 */
router.delete(
  "/delete",
  authenticationToken,
  validateDeleteTransaction,
  async (req, res, next) => {
    try {
      // 👤 Logged-in user ID
      const userId = req.userId;

      // 📥 Transaction ID from query
      const { trnId } = req.query;

      await deleteTransaction(userId, trnId);
      return sendSuccess(res, {
        statusCode: 200,
        message: "Transaction deleted successfully",
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * ======================================================
 * 🔁 GET ALL RECURRING TRANSACTIONS (WITH CATEGORY)
 * ======================================================
 * @route   GET /transactions/recurring
 * @desc    Fetch recurring transactions with category details
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Fetch all recurring transactions for logged-in user
 * - Join category details (name, type)
 * - Return sorted by latest created
 */
router.get("/recurring", authenticationToken, async (req, res, next) => {
  try {
    // 👤 Logged-in user ID
    const userId = req.userId;

    const rows = await getRecurringTransactions(userId);
    return sendSuccess(res, {
      statusCode: 200,
      data: rows,
    });
  } catch (err) {
    // ❌ Handle server errors
    return next(err);
  }
});

/**
 * ======================================================
 * 🔁 ADD RECURRING TRANSACTION
 * ======================================================
 * @route   POST /transactions/recurring/add
 * @desc    Create a recurring expense
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Validate required recurring expense fields
 * - Store recurring transaction details
 * - Support optional note and end date
 */
router.post(
  "/recurring/add",
  authenticationToken,
  validateAddRecurringTransaction,
  async (req, res, next) => {
    try {
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
    } catch (err) {
      // ❌ Handle unexpected server errors
      next(err);
    }
  },
);

/**
 * ======================================================
 * 🔁 UPDATE RECURRING TRANSACTION (Details + Status)
 * ======================================================
 * @route   PUT /transactions/recurring/update
 * @desc    Update recurring expense details or status
 * @access  Private (JWT protected)
 *
 * Responsibilities:
 * - Allow partial updates (dynamic fields)
 * - Support status toggle (is_active)
 * - Ensure user ownership before update
 */
router.put(
  "/recurring/update",
  authenticationToken,
  validateUpdateRecurringTransaction,
  async (req, res, next) => {
    try {
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
    } catch (err) {
      // ❌ Handle server errors
      next(err);
    }
  },
);

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
