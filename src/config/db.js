// =======================================
// 📦 Import MySQL library
// =======================================
const mysql = require("mysql2");

// =======================================
// 🌱 Load environment variables (only in non-prod)
// =======================================
// In production (Render, Railway, etc.), env vars
// are injected by the platform automatically
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// =======================================
// 🗄️ Create MySQL connection pool
// =======================================
// Pool = reuse connections (fast & scalable)
const pool = mysql.createPool({
  host: process.env.DB_HOST,        // DB server address
  user: process.env.DB_USER,        // DB username
  password: process.env.DB_PASSWORD,// DB password
  database: process.env.DB_NAME,    // Database name
  port: process.env.DB_PORT || 3306,// MySQL default port

  // 🔐 SSL required for cloud databases
  ssl: {
    rejectUnauthorized: false, // allow self-signed certs
  },

  // ⚙️ Pool behavior settings
  waitForConnections: true, // wait if all connections busy
  connectionLimit: 10,      // max simultaneous connections
  queueLimit: 0,            // unlimited waiting requests
});

// =======================================
// 🔄 Convert pool to Promise-based API
// =======================================
// Allows use of async/await instead of callbacks
const db = pool.promise();

// =======================================
// 🧪 Test database connection at startup
// =======================================
(async () => {
  try {
    await db.query("SELECT 1");
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    process.exit(1); // Stop server if DB fails
  }
})();

// =======================================
// 📤 Export DB connection for other modules
// =======================================
module.exports = db;
