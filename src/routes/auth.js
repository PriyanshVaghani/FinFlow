// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken"); // 🔑 For generating JWT tokens
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📤 Standard API responses
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
 * 1. Validate input fields
 * 2. Register user via service (checks existence, hashes password, inserts)
 * 3. Send success response
 */
router.post("/register", async (req, res) => {
  // 📥 Extract request body
  const { name, email, password, mobileNo } = req.body;

  // 1️⃣ Validate required fields
  if (!name || !email || !password || !mobileNo) {
    return sendError(res, {
      statusCode: 422, // Unprocessable Entity
      message: "All fields are required",
    });
  }

  try {
    // 2️⃣ Register the user via service
    const userData = await registerUser({ name, email, password, mobileNo });

    // 3️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 201, // Created
      message: "User registered successfully",
      data: userData,
    });
  } catch (err) {
    // ❌ Handle unexpected errors
    if (err.message === "User already exists") {
      return sendError(res, {
        statusCode: 409, // Conflict
        message: err.message,
      });
    }
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

/**
 * ======================================================
 * 🔐 USER LOGIN
 * ======================================================
 * @route   POST /login
 * @desc    Authenticate user and return JWT
 * @access  Public
 *
 * Flow:
 * 1. Validate credentials
 * 2. Authenticate user via service (verify existence and password)
 * 3. Generate JWT token
 * 4. Send success response
 */
router.post("/login", async (req, res) => {
  // 📥 Extract credentials
  const { email, password } = req.body;

  // 1️⃣ Validate request body
  if (!email || !password) {
    return sendError(res, {
      statusCode: 422,
      message: "All fields are required",
    });
  }

  try {
    // 2️⃣ Authenticate user via service
    const user = await loginUser(email, password);

    // 3️⃣ Generate JWT token
    const token = jwt.sign(
      { userId: user.userId }, // Payload
      process.env.JWT_SECRET, // Secret key
      { expiresIn: process.env.JWT_EXPIRES_IN }, // Expiry time
    );

    // 4️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "User login successfully",
      data: {
        token,
        ...user,
      },
    });
  } catch (err) {
    // ❌ Handle authentication errors
    if (
      err.message === "User not found" ||
      err.message === "Invalid credentials"
    ) {
      return sendError(res, {
        statusCode: 401,
        message: err.message,
      });
    }
    return sendError(res, {
      statusCode: 500,
      message: err.message,
    });
  }
});

// =======================================
// 📤 Export Router
// =======================================
module.exports = router;
