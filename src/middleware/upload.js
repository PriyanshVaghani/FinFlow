// =======================================
// 📦 Required Modules
// =======================================
const multer = require("multer"); // Middleware for handling multipart/form-data (file uploads)
const path = require("path"); // Helps work with file & directory paths
const fs = require("fs"); // File system module to manage folders/files

// =======================================
// 📁 Upload Directory Path
// =======================================
// All transaction attachments will be stored inside this folder
const uploadDir = "uploads/transactions";

// =======================================
// 📂 Ensure Upload Directory Exists
// =======================================
// If the folder does NOT exist, create it automatically.
// This prevents ENOENT errors when saving files.
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// =======================================
// 🗄️ Multer Storage Configuration
// =======================================
const storage = multer.diskStorage({
  // 📍 Step 1: Define destination folder
  destination: (req, file, cb) => {
    // cb(error, destinationPath)
    // Only folder path should be provided here
    cb(null, uploadDir);
  },

  // 🏷 Step 2: Generate unique filename
  filename: (req, file, cb) => {
    // Extract original file extension (.png, .jpg, .pdf)
    const ext = path.extname(file.originalname);

    // Generate a unique filename using timestamp + random number
    // This avoids file overwrite issues
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
// This middleware is used in routes to handle file uploads
module.exports = multer({
  storage, // Custom disk storage config
  fileFilter, // File type validation
  limits: {
    fileSize: 5 * 1024 * 1024, // ⛔ Max file size = 5MB per file
  },
});
