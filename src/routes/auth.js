// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt"); // 🔐 For hashing & verifying passwords
const jwt = require("jsonwebtoken"); // 🔑 For generating JWT tokens
const db = require("../config/db"); // 🗄️ MySQL DB connection
const { sendSuccess, sendError } = require("../utils/responseHelper"); // 📤 Standard API responses

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
 * 2. Check existing user (email / mobile)
 * 3. Hash password securely
 * 4. Insert user into database
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
    // 2️⃣ Check if user already exists (email or mobile)
    const [existing] = await db.query(
      "SELECT user_id FROM users WHERE email = ? OR mobile_no = ?",
      [email, mobileNo]
    );

    if (existing.length > 0) {
      return sendError(res, {
        statusCode: 409, // Conflict
        message: "User already exists",
      });
    }

    // 3️⃣ Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4️⃣ Insert new user into database
    const [result] = await db.query(
      `
      INSERT INTO users (name, email, password_hash, mobile_no)
      VALUES (?, ?, ?, ?)
      `,
      [name, email, hashedPassword, mobileNo]
    );

    // 5️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 201, // Created
      message: "User registered successfully",
      data: {
        userId: result.insertId,
        name,
        email,
        mobileNo,
      },
    });
  } catch (err) {
    // ❌ Handle unexpected errors
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
 * 2. Verify user existence
 * 3. Compare password hash
 * 4. Generate JWT token
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
    // 2️⃣ Fetch user by email
    const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    // ❌ User not found
    if (existing.length === 0) {
      return sendError(res, {
        statusCode: 401,
        message: "User not found",
      });
    }

    const user = existing[0];

    // 3️⃣ Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return sendError(res, {
        statusCode: 401,
        message: "Invalid credentials",
      });
    }

    // 4️⃣ Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id }, // Payload
      process.env.JWT_SECRET, // Secret key
      { expiresIn: process.env.JWT_EXPIRES_IN } // Expiry time
    );

    // 5️⃣ Send success response
    return sendSuccess(res, {
      statusCode: 200,
      message: "User login successfully",
      data: {
        token,
        userId: user.user_id,
        name: user.name,
        email: user.email,
        mobileNo: user.mobile_no,
      },
    });
  } catch (err) {
    // ❌ Server / DB error
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
