// =======================================
// 📦 Import Required Modules
// =======================================
const db = require("../config/db");

/**
 * ======================================================
 * ➕ CREATE NOTIFICATION
 * ======================================================
 * Call this function from other services (like transactions or auth)
 */
const createNotification = async (userId, title, message, type = "info") => {
  const [result] = await db.query(
    `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
    [userId, title, message, type]
  );
  
  return result.insertId;
};

/**
 * ======================================================
 * 📥 GET USER NOTIFICATIONS
 * ======================================================
 */
const getUserNotifications = async (userId, limit = 20, offset = 0) => {
  // Fetch the notifications
  const [notifications] = await db.query(
    `
    SELECT id, title, message, type, is_read, created_at
    FROM notifications
    WHERE user_id = ? 
      AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
    `,
    [userId, limit, offset],
  );

  // Get the total count for pagination (only counting last 30 days)
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [userId],
  );

  // Get the unread count (only counting last 30 days)
  const [[{ unreadCount }]] = await db.query(
    `SELECT COUNT(*) AS unreadCount FROM notifications 
     WHERE user_id = ? AND is_read = FALSE AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [userId],
  );

  return {
    notifications,
    total,
    unreadCount,
  };
};

/**
 * ======================================================
 * ✅ MARK SINGLE NOTIFICATION AS READ
 * ======================================================
 */
const markAsRead = async (userId, notificationId) => {
  const [result] = await db.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?`,
    [notificationId, userId],
  );

  if (result.affectedRows === 0) {
    throw { statusCode: 404, message: "Notification not found" };
  }
  return true;
};

/**
 * ======================================================
 * ✅ MARK ALL NOTIFICATIONS AS READ
 * ======================================================
 */
const markAllAsRead = async (userId) => {
  await db.query(
    `UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE`,
    [userId],
  );
  return true;
};

/**
 * ======================================================
 * 🗑️ DELETE NOTIFICATION
 * ======================================================
 */
const deleteNotification = async (userId, notificationId) => {
  const [result] = await db.query(
    `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
    [notificationId, userId],
  );
  if (result.affectedRows === 0) {
    throw { statusCode: 404, message: "Notification not found" };
  }
  return true;
};

// =======================================
// 📤 Export Module
// =======================================
module.exports = {
  createNotification,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
