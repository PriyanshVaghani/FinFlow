// =======================================
// 👤 Auth Request Validators
// =======================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_\-+=\[\]{}|;:'",.<>\/\\`~]).{8,72}$/;

const STRONG_PASSWORD_MESSAGE =
  "Password must be 8–72 characters and include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character";

/**
 * ======================================================
 * 🔎 Validate Register Request
 * ======================================================
 * Ensures all required fields for user registration exist
 * and password meets strong-password rules
 */
const validateRegister = (req, res, next) => {
  const { name, email, password, mobileNo } = req.body;

  // Validate name
  if (!name || !String(name).trim()) {
    return next({
      statusCode: 422,
      message: "Name is required to create an account",
    });
  }

  if (String(name).trim().length < 2) {
    return next({
      statusCode: 422,
      message: "Name must be at least 2 characters",
    });
  }

  // Validate email
  if (!email || !String(email).trim()) {
    return next({
      statusCode: 422,
      message: "Email address is required",
    });
  }

  if (!EMAIL_REGEX.test(String(email).trim())) {
    return next({
      statusCode: 422,
      message: "Please enter a valid email address",
    });
  }

  // Validate password
  if (!password) {
    return next({
      statusCode: 422,
      message: "Password is required to create an account",
    });
  }

  if (!PASSWORD_REGEX.test(password)) {
    return next({
      statusCode: 422,
      message: STRONG_PASSWORD_MESSAGE,
    });
  }

  // Validate mobile number
  if (!mobileNo || !String(mobileNo).trim()) {
    return next({
      statusCode: 422,
      message: "Mobile number is required",
    });
  }

  if (!MOBILE_REGEX.test(String(mobileNo).trim())) {
    return next({
      statusCode: 422,
      message: "Mobile number must be a valid 10-digit number",
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
  EMAIL_REGEX,
  MOBILE_REGEX,
  PASSWORD_REGEX,
  STRONG_PASSWORD_MESSAGE,
};
