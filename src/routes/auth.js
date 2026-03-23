// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken"); // 🔑 For generating JWT tokens
const { sendSuccess } = require("../utils/responseHelper"); // 📤 Standard API responses
const {
  validateRegister,
  validateLogin,
} = require("../validators/auth.validator"); // ✅ Request validators for register & login
const asyncHandler = require("../utils/asyncHandler"); // 🔁 Handles async errors (removes try-catch)
const { registerUser, loginUser } = require("../services/auth.service"); // 👤 User auth services

/**
 * ======================================================
 * 👤 USER REGISTRATION
 * ======================================================
 * @route   POST /register
 * @desc    Register a new user
 * @access  Public
 *
 * Flow:
 * - Request validation handled by validator middleware
 * - Register user via service (checks existence, hashes password, inserts)
 * - Send success response
 * - Pass errors to global error handler
 */
router.post(
  "/register",
  validateRegister,
  asyncHandler(async (req, res) => {
    // 📥 Extract request body
    const { name, email, password, mobileNo } = req.body;

    // 👤 Register the user via service
    const userData = await registerUser({ name, email, password, mobileNo });

    // 📤 Send success response
    return sendSuccess(res, {
      statusCode: 201, // Created
      message: "User registered successfully",
      data: userData,
    });
  }),
);

/**
 * ======================================================
 * 🔐 USER LOGIN
 * ======================================================
 * @route   POST /login
 * @desc    Authenticate user and return JWT token
 * @access  Public
 *
 * Flow:
 * - Request validation handled by validator middleware
 * - Authenticate user via service (verify existence and password)
 * - Generate JWT token
 * - Send success response
 */
router.post(
  "/login",
  validateLogin,
  asyncHandler(async (req, res) => {
    // 📥 Extract credentials
    const { email, password } = req.body;

    // 🔐 Authenticate user via service
    const user = await loginUser(email, password);

    // 🔑 Generate JWT token
    const token = jwt.sign(
      { userId: user.userId }, // Token payload
      process.env.JWT_SECRET, // Secret key
      { expiresIn: process.env.JWT_EXPIRES_IN }, // Token expiry
    );

    // 📤 Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "User logged in successfully",
      data: {
        token,
        ...user,
      },
    });
  }),
);

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
