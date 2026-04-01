// =======================================
// 📦 Import Required Modules
// =======================================
const db = require("../config/db");

/**
 * ======================================================
 * 📂 GET CATEGORIES SERVICE
 * ======================================================
 * Fetch all categories by type (user + default)
 */
const getCategories = async (type, userId) => {
  // 1️⃣ Fetch categories
  // - Includes user's own categories
  // - Includes predefined system categories (user_id IS NULL)
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - categories → Category definitions and metadata
   *
   * JSON_EXTRACT:
   * - Extracts boolean string from CASE expression
   * - Returns 'true' or 'false' based on is_active flag
   *
   * CASE Expression:
   * - Converts is_active (0/1) to readable boolean strings
   *
   * WHERE Clause:
   * - Filters by category type (Income/Expense)
   * - Includes user-specific and system categories (user_id IS NULL)
   */
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
    [type, userId],
  );

  return rows;
};

/**
 * ======================================================
 * ➕ ADD CATEGORY SERVICE
 * ======================================================
 * Create a new category with validation
 */
const addCategory = async (name, type, userId) => {
  const ALLOWED_TYPES = ["Income", "Expense"];

  // 1️⃣ Validate category type
  if (!ALLOWED_TYPES.includes(type)) {
    throw { statusCode: 422, message: "Invalid category type" };
  }

  // 2️⃣ Prevent user from adding default category name
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - categories → Category definitions and metadata
   *
   * WHERE Clause:
   * - Matches exact name and type
   * - user_id IS NULL targets system/default categories only
   * - is_active = 1 ensures only active defaults are checked
   */
  const [existing] = await db.query(
    `
      SELECT category_id FROM categories
      WHERE name = ? AND type = ? AND user_id IS NULL AND is_active = 1
    `,
    [name.trim(), type],
  );

  if (existing.length > 0) {
    throw {
      statusCode: 409,
      message: "Category with this name and type already exists",
    };
  }

  // 3️⃣ Insert new category for the logged-in user
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - categories → Category definitions and metadata
   *
   * INSERT Operation:
   * - Creates user-specific category
   * - name trimmed for consistency
   * - type validated earlier (Income/Expense)
   * - user_id links to creating user
   */
  const [result] = await db.query(
    `
    INSERT INTO categories (name, type, user_id)
    VALUES (?, ?, ?)
    `,
    [name.trim(), type, userId],
  );

  // 4️⃣ Return category ID
  return {
    categoryId: result.insertId,
  };
};

/**
 * ======================================================
 * ✏️ UPDATE CATEGORY SERVICE
 * ======================================================
 * Update category name
 */
const updateCategory = async (categoryId, name, userId) => {
  // 1️⃣ Update category (only user's active categories)
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - categories → Category definitions and metadata
   *
   * UPDATE Operation:
   * - Modifies category name for user-owned categories
   *
   * WHERE Clause:
   * - category_id ensures specific category
   * - user_id enforces ownership
   * - is_active = 1 prevents updating deleted categories
   */
  const [result] = await db.query(
    `
    UPDATE categories
    SET name = ?
    WHERE category_id = ?
      AND user_id = ?
      AND is_active = 1
    `,
    [name.trim(), categoryId, userId],
  );

  // 2️⃣ Check if update was successful
  if (result.affectedRows === 0) {
    throw { statusCode: 404, message: "Category not found or unauthorized" };
  }

  return true;
};

/**
 * ======================================================
 * 🗑️ DELETE CATEGORY SERVICE (SOFT DELETE)
 * ======================================================
 * Mark category as inactive
 */
const deleteCategory = async (categoryId, userId) => {
  // 1️⃣ Soft delete category (mark inactive)
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - categories → Category definitions and metadata
   *
   * UPDATE Operation:
   * - Soft delete by setting is_active to 0
   * - Preserves data while hiding from UI
   *
   * WHERE Clause:
   * - category_id targets specific category
   * - user_id ensures ownership permission
   */
  const [result] = await db.query(
    `
    UPDATE categories
    SET is_active = 0
    WHERE category_id = ?
      AND user_id = ?
    `,
    [categoryId, userId],
  );

  // 2️⃣ Check if delete was successful
  if (result.affectedRows === 0) {
    throw { statusCode: 404, message: "Category not found or unauthorized" };
  }

  return true;
};

module.exports = {
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
};
