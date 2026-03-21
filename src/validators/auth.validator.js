// =======================================
// 👤 Auth Request Validators
// =======================================

/**
 * ======================================================
 * 🔎 Validate Register Request
 * ======================================================
 * Ensures all required fields for user registration exist
 */
const validateRegister = (req, res, next) => {
  const { name, email, password, mobileNo } = req.body;

  // Validate name
  if (!name) {
    return next({
      statusCode: 422,
      message: "Name is required to create an account",
    });
  }

  // Validate email
  if (!email) {
    return next({
      statusCode: 422,
      message: "Email address is required",
    });
  }

  // Validate password
  if (!password) {
    return next({
      statusCode: 422,
      message: "Password is required to create an account",
    });
  }

  // Validate mobile number
  if (!mobileNo) {
    return next({
      statusCode: 422,
      message: "Mobile number is required",
    });
  }

  next();
};

/**
 * ======================================================
 * 🔎 Validate Login Request
 * ======================================================
 * Ensures required login credentials are provided
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  // Validate email
  if (!email) {
    return next({
      statusCode: 422,
      message: "Email address is required",
    });
  }

  // Validate password
  if (!password) {
    return next({
      statusCode: 422,
      message: "Password is required",
    });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
};
