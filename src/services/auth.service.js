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
  try {
    // 1️⃣ Check if user already exists (email or mobile)
    const [existing] = await db.query(
      "SELECT user_id FROM users WHERE email = ? OR mobile_no = ?",
      [email, mobileNo],
    );

    if (existing.length > 0) {
      throw new Error("User already exists");
    }

    // 2️⃣ Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3️⃣ Insert new user into database
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
  } catch (err) {
    throw err; // Re-throw to let the route handle it
  }
};

/**
 * ======================================================
 * 🔐 LOGIN USER SERVICE
 * ======================================================
 * Handles user login business logic
 */
const loginUser = async (email, password) => {
  try {
    // 1️⃣ Fetch user by email
    const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    // ❌ User not found
    if (existing.length === 0) {
      throw new Error("User not found");
    }

    const user = existing[0];

    // 2️⃣ Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      throw new Error("Invalid credentials");
    }

    // 3️⃣ Return user data (exclude password_hash)
    return {
      userId: user.user_id,
      name: user.name,
      email: user.email,
      mobileNo: user.mobile_no,
    };
  } catch (err) {
    throw err; // Re-throw to let the route handle it
  }
};

module.exports = { registerUser, loginUser };
