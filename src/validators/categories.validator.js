// =======================================
// 📦 Category Request Validators
// =======================================

/**
 * ======================================================
 * 📂 Validate Get Categories Request
 * ======================================================
 * Ensures category type query parameter exists
 */
const validateGetCategories = (req, res, next) => {
  const { type } = req.query;

  // 🔎 Validate type presence
  if (!type) {
    return next({
      statusCode: 422,
      message: "Category type is required to fetch categories",
    });
  }

  next();
};

/**
 * ======================================================
 * ➕ Validate Add Category Request
 * ======================================================
 * Ensures category name and type exist
 */
const validateAddCategory = (req, res, next) => {
  const { name, type } = req.body;

  // 🔎 Validate category name
  if (!name) {
    return next({
      statusCode: 422,
      message: "Category name is required",
    });
  }

  // 🔎 Validate category type
  if (!type) {
    return next({
      statusCode: 422,
      message: "Category type is required to create a category",
    });
  }

  next();
};

/**
 * ======================================================
 * ✏️ Validate Update Category Request
 * ======================================================
 * Ensures categoryId and name exist
 */
const validateUpdateCategory = (req, res, next) => {
  const { categoryId } = req.query;
  const { name } = req.body;

  // 🔎 Validate categoryId
  if (!categoryId) {
    return next({
      statusCode: 422,
      message: "Category ID is required",
    });
  }

  // 🔎 Validate category name
  if (!name) {
    return next({
      statusCode: 422,
      message: "Category name is required to update the category",
    });
  }

  next();
};

/**
 * ======================================================
 * 🗑️ Validate Delete Category Request
 * ======================================================
 * Ensures categoryId query parameter exists
 */
const validateDeleteCategory = (req, res, next) => {
  const { categoryId } = req.query;

  // 🔎 Validate categoryId
  if (!categoryId) {
    return next({
      statusCode: 422,
      message: "Category ID is required",
    });
  }

  next();
};

// =======================================
// 📤 Export Validators
// =======================================
module.exports = {
  validateGetCategories,
  validateAddCategory,
  validateUpdateCategory,
  validateDeleteCategory,
};
