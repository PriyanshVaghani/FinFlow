// =======================================
// 📦 Import Required Modules
// =======================================
const express = require("express");
const router = express.Router();
const { sendSuccess } = require("../utils/responseHelper");
const { authenticationToken } = require("../middleware/auth_middleware");
const asyncHandler = require("../utils/asyncHandler");

const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../services/notification.service");

/**
 * ======================================================
 * 📌 TAG: Notification APIs
 * ======================================================
 */

/**
 * ======================================================
 * 📥 GET /notifications
 * ======================================================
 * @route   GET /api/notifications
 * @desc    Fetch paginated notifications for the logged-in user
 * @access  Private (JWT protected)
 */
/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     description: Fetch paginated notifications for the current user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: Number of records to skip (default 0)
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *         description: Number of records to return (default 20)
 *     responses:
 *       200:
 *         description: Notifications fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isError:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     notifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           message:
 *                             type: string
 *                           type:
 *                             type: string
 *                           is_read:
 *                             type: boolean
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                     total:
 *                       type: integer
 *                     unreadCount:
 *                       type: integer
 */
router.get(
  "/",
  authenticationToken,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const skip = Math.max(0, parseInt(req.query.skip) || 0);
    const take = Math.max(1, parseInt(req.query.take) || 20);

    const data = await getUserNotifications(userId, take, skip);

    return sendSuccess(res, { statusCode: 200, data });
  }),
);

/**
 * ======================================================
 * ✅ PUT /notifications/read-all
 * ======================================================
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all user notifications as read
 * @access  Private (JWT protected)
 */
/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     description: Marks every unread notification for the user as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.put(
  "/read-all",
  authenticationToken,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    await markAllAsRead(userId);

    return sendSuccess(res, {
      statusCode: 200,
      message: "All notifications marked as read",
    });
  }),
);

/**
 * ======================================================
 * ✅ PUT /notifications/read
 * ======================================================
 * @route   PUT /api/notifications/read
 * @desc    Mark a specific notification as read
 * @access  Private (JWT protected)
 */
/**
 * @swagger
 * /api/notifications/read:
 *   put:
 *     summary: Mark notification as read
 *     description: Marks a single notification as read by ID
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification marked as read
 */
router.put(
  "/read",
  authenticationToken,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { notificationId } = req.query;

    await markAsRead(userId, notificationId);
    return sendSuccess(res, {
      statusCode: 200,
      message: "Notification marked as read",
    });
  }),
);

/**
 * ======================================================
 * 🗑️ DELETE /notifications/delete
 * ======================================================
 * @route   DELETE /api/notifications/delete
 * @desc    Delete a specific notification
 * @access  Private (JWT protected)
 */
/**
 * @swagger
 * /api/notifications/delete:
 *   delete:
 *     summary: Delete notification
 *     description: Deletes a single notification by ID
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Notification ID
 *     responses:
 *       200:
 *         description: Notification deleted successfully
 */
router.delete(
  "/delete",
  authenticationToken,
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { notificationId } = req.query;

    await deleteNotification(userId, notificationId);
    return sendSuccess(res, {
      statusCode: 200,
      message: "Notification deleted successfully",
    });
  }),
);

module.exports = router;
