// =======================================
// 📦 Import Required Modules
// =======================================
const bcrypt = require("bcrypt");
const db = require("../config/db");

/**
 * ======================================================
 * 👤 REGISTER USER SERVICE
 * ======================================================
 * Handles user registration business logic
 */
const registerUser = async ({ name, email, password, mobileNo }) => {
  // 1️⃣ Check if user already exists (email or mobile)
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - users → User account information
   *
   * WHERE Clause:
   * - Checks both email and mobile_no to prevent duplicate accounts
   * - OR condition allows matching on either field
   */
  const [existing] = await db.query(
    "SELECT user_id FROM users WHERE email = ? OR mobile_no = ?",
    [email, mobileNo],
  );

  if (existing.length > 0) {
    throw { statusCode: 409, message: "User already exists" };
  }

  // 2️⃣ Hash the password before storing
  const hashedPassword = await bcrypt.hash(password, 10);

  // 3️⃣ Insert new user into database
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - users → User account information
   *
   * INSERT Operation:
   * - Creates new user record with provided details
   * - password_hash stores bcrypt-hashed password
   * - mobile_no stored as provided
   */
  const [result] = await db.query(
    `
    INSERT INTO users (name, email, password_hash, mobile_no)
    VALUES (?, ?, ?, ?)
    `,
    [name, email, hashedPassword, mobileNo],
  );

  // 4️⃣ Return user data
  return {
    userId: result.insertId,
    name,
    email,
    mobileNo,
  };
};

/**
 * ======================================================
 * 🔐 LOGIN USER SERVICE
 * ======================================================
 * Handles user login business logic
 */
const loginUser = async (email, password) => {
  // 1️⃣ Fetch user by email
  /**
   * 📊 SQL Query Explanation
   *
   * Tables Used:
   * - users → User account information
   *
   * SELECT *:
   * - Retrieves all user fields for authentication
   * - Includes password_hash for verification
   *
   * WHERE Clause:
   * - Matches exact email for login
   */
  const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [
    email,
  ]);

  // ❌ User not found
  if (existing.length === 0) {
    throw { statusCode: 404, message: "User not found" };
  }

  const user = existing[0];

  // ❌ Check if account is inactive
  if (!user.is_active) {
    throw {
      statusCode: 403,
      message: "Your account is inactive. Please contact admin.",
    };
  }

  // 2️⃣ Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);

  if (!isPasswordValid) {
    throw { statusCode: 401, message: "Invalid credentials" };
  }

  // 3️⃣ Return user data (exclude password_hash)
  return {
    userId: user.user_id,
    name: user.name,
    email: user.email,
    mobileNo: user.mobile_no,
  };
};

module.exports = { registerUser, loginUser };
