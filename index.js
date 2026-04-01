// =======================================
// 📦 Import required modules
// =======================================
const express = require("express");
const cors = require("cors"); // ✅ ADDED: CORS middleware to allow frontend requests
require("dotenv").config(); // Loads .env variables into process.env

// =======================================
// 🚀 Initialize Express app
// =======================================
const app = express();

// =======================================
// �️ Rate Limiting Configuration
// =======================================
const rateLimit = require("express-rate-limit");

// =======================================
// 🌐 CORS Configuration (IMPORTANT)
// =======================================
// Allows frontend (React/Vite) to communicate with backend

app.use(
  cors({
    origin: "http://localhost:5173", // ✅ Frontend URL (Vite default)
    credentials: true,
  }),
);

// ⚡ Middleware to parse JSON request bodies
// Required to access req.body in POST/PUT requests
app.use(express.json());

// Middleware to parse application/x-www-form-urlencoded
// Needed when data is sent from HTML forms
app.use(express.urlencoded({ extended: true }));

// Global API Rate Limiter (Applies to all /api routes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: { isError: true, message: "Too many requests from this IP, please try again after 15 minutes" },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter Rate Limiter for Authentication Routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 auth requests per window
  message: { isError: true, message: "Too many authentication attempts from this IP, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global limiter to all /api routes
app.use("/api", globalLimiter);

// =======================================
// 🛣️ Import & Register Routes
// =======================================
// All authentication-related APIs will start with /api/auth
const authRoutes = require("./src/routes/auth.routes");
const dashboardRoutes = require("./src/routes/dashboard.routes");
const categoriesRoutes = require("./src/routes/categories.routes");
const transactionsRoutes = require("./src/routes/transactions.routes");
const budgetsRoutes = require("./src/routes/budgets.routes");
const reportRoutes = require("./src/routes/report.routes");

// Import global error handler
const errorHandler = require("./src/middleware/errorHandler");

const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./src/config/swagger");

// 📄 Swagger Docs Route
app.use("/api/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Apply the stricter auth limiter specifically to the auth routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/budgets", budgetsRoutes);
app.use("/api/report", reportRoutes);

// =======================================
// 📂 Serve uploaded files as static assets
// =======================================

// This makes the "uploads" folder publicly accessible via URL
// Any file stored inside the "uploads" directory can be accessed
// directly from the browser or frontend using a public URL

// Example:
// File saved at: uploads/transactions/receipt.png
// Can be accessed via:
// http://localhost:3000/uploads/transactions/receipt.png

// "/uploads"        → URL path (public route)
// "uploads"         → Actual folder name on the server

app.use("/uploads", express.static("uploads"));

// =======================================
// ❗ Global Error Handler (Must be last)
// =======================================
app.use(errorHandler);

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


// =======================================
// 🔁 Start background cron jobs
// =======================================
require("./src/cron/recurringExpenseCron");