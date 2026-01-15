// =======================================
// 📦 Required Modules
// =======================================
const multer = require("multer"); // Middleware for handling multipart/form-data (file uploads)
const path = require("path"); // Helps work with file & directory paths
const fs = require("fs"); // File system module to manage folders/files

// =======================================
// 📁 Upload Directory Path
// =======================================
// Base folder for transaction attachments
// Actual files will be stored inside:
// uploads/transactions/user_<userId>/
const BASE_UPLOAD_DIR = "uploads/transactions";

// =======================================
// 🗄️ Multer Storage Configuration
// =======================================
const storage = multer.diskStorage({
  // 📍 Step 1: Define destination folder (per user)
  destination: (req, file, cb) => {
    // cb(error, destinationPath)
    // Destination folder is decided dynamically based on logged-in user
    // userId comes from authenticationToken middleware
    const userId = req.userId;

    if (!userId) {
      return cb(new Error("User not authenticated"), null);
    }

    // uploads/transactions/user_12
    const userDir = path.join(BASE_UPLOAD_DIR, `user_${userId}`);

    // Create user-specific directory if it doesn't exist
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    cb(null, userDir);
  },

  // 🏷 Step 2: Generate unique filename (inside user folder)
  filename: (req, file, cb) => {
    // Extract original file extension (.png, .jpg, .pdf)
    const ext = path.extname(file.originalname);

    // Generate a unique filename using timestamp + random number
    // Prevents filename collision within the same user folder
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    // cb(error, filename)
    cb(null, uniqueName);
  },
});

// =======================================
// 🚫 File Type Validation (Security)
// =======================================
// Allow only specific file types to prevent malicious uploads
const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg", // JPG images
    "image/png", // PNG images
    "application/pdf", // PDF documents
  ];

  // Check if uploaded file type is allowed
  if (allowed.includes(file.mimetype)) {
    cb(null, true); // ✅ Accept file
  } else {
    cb(new Error("Only JPG, PNG images and PDF files are allowed."), false); // ❌ Reject file
  }
};

// =======================================
// 🚀 Export Multer Middleware
// =======================================
// This middleware stores uploaded files
// inside user-specific folders under uploads/transactions/
module.exports = multer({
  storage, // Custom disk storage config (per user)
  fileFilter, // File type validation
  limits: {
    fileSize: 5 * 1024 * 1024, // ⛔ Max file size = 5MB per file
  },
});
