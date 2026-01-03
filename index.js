// =======================================
// 📦 Import required modules
// =======================================
const express = require("express");
require("dotenv").config(); // Loads .env variables into process.env

// =======================================
// 🚀 Initialize Express app
// =======================================
const app = express();

// ⚡ Middleware to parse JSON request bodies
// Required to access req.body in POST/PUT requests
app.use(express.json());  

// Middleware to parse application/x-www-form-urlencoded
// Needed when data is sent from HTML forms
app.use(express.urlencoded({ extended: true }));

// =======================================
// 🛣️ Import & Register Routes
// =======================================
// All authentication-related APIs will start with /api/auth
const authRoutes = require("./src/routes/auth");
app.use("/api/auth", authRoutes);

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
