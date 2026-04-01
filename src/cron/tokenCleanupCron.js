// =======================================
// ⏱️ TOKEN CLEANUP CRON JOB SETUP
// =======================================
const cron = require("node-cron");
const db = require("../config/db");

/**
 * 🕒 Runs every day at 1:00 AM
 *
 * CRON SCHEDULE: "0 1 * * *"
 *
 * ⏰ Meaning:
 * - Runs at 1:00 AM every day
 *
 * ✅ Used for:
 * - Deleting expired JWT tokens from the token_blacklist table
 * - Keeps the database lightweight and queries fast
 */
cron.schedule("0 1 * * *", async () => {
  try {
    /**
     * 🗑️ DELETE Operation: expires_at < NOW()
     * 
     * WHY DO WE WAIT UNTIL IT EXPIRES?
     * If a hacker steals an active token and the user logs out, the token goes into this blacklist.
     * We MUST keep it here until its natural expiration time to block the hacker from using it.
     * 
     * WHY DO WE DELETE IT AT ALL?
     * Once the original expiration time passes, the JWT library's `jwt.verify()` function 
     * will automatically reject it. Since the token is mathematically dead, we no longer need 
     * the database to block it. Deleting it keeps the table small and API requests fast!
     */
    const [result] = await db.query(
      `DELETE FROM token_blacklist WHERE expires_at < NOW()`
    );

    // Log the cleanup result for monitoring (optional)
    if (result.affectedRows > 0) {
      console.log(`🧹 [CRON] Cleaned up ${result.affectedRows} expired tokens from blacklist.`);
    }
  } catch (error) {
    console.error("❌ [CRON Error] Failed to clean up token blacklist:", error);
  }
});