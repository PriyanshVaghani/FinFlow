// =======================================
// 📦 Import required modules
// =======================================
const express = require("express");
require("dotenv").config(); // Loads .env variables into process.env

// =======================================
// 🚀 Initialize Express app
// =======================================
const app = express();

// =======================================
// 🔌 Server Port Configuration
// =======================================
// NOTE: Environment variables are ALWAYS strings
// Use process.env.PORT (capital letters is standard)
const port = process.env.PORT || 3000;

// =======================================
// ▶️ Start the HTTP server
// =======================================
app.listen(port, () => {
  console.log(`🚀 FinFlow Server is running on port ${port}`);
});
