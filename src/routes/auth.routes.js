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
 * 📌 TAG: Auth APIs
 * ======================================================
 */

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
/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register new user
 *     description: Create a new user account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - mobileNo
 *             properties:
 *               name:
 *                 type: string
 *                 example: Priyansh
 *               email:
 *                 type: string
 *                 example: test@gmail.com
 *               password:
 *                 type: string
 *                 example: 123456
 *               mobileNo:
 *                 type: string
 *                 example: "9876543210"
 *     responses:
 *       201:
 *         description: User registered successfully
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
 *                   example: User registered successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     mobileNo:
 *                       type: string
 *       409:
 *         description: User already exists
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
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user and return JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: test@gmail.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Login successful
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
 *                   example: User logged in successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                     userId:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *       401:
 *         description: Invalid email or password
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
