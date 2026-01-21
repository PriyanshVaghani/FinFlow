// =======================================
// ⏱️ CRON JOB SETUP
// =======================================
const cron = require("node-cron");
const db = require("../config/db");

// =======================================
// 🕒 Cron Timing Information
// =======================================
/**
 * 🕒 Runs every day at 12:01 AM
 *
 * CRON SCHEDULE: "1 0 * * *"
 *
 * ┌───────────── minute (0 - 59)
 * │ ┌───────────── hour (0 - 23)
 * │ │ ┌───────────── day of month (1 - 31)
 * │ │ │ ┌───────────── month (1 - 12)
 * │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
 * │ │ │ │ │
 * │ │ │ │ │
 * 1 0 * * *
 *
 * ⏰ Meaning:
 * - Runs at 12:01 AM every day
 *
 * Breakdown:
 * - minute = 1        → at the 1st minute
 * - hour = 0          → of hour 0 (midnight)
 * - day of month = *  → every day of the month
 * - month = *         → every month
 * - day of week = *   → every day of the week
 *
 * 🕒 Example run times:
 * - 00:01 on Jan 1
 * - 00:01 on Feb 15
 * - 00:01 on any day, every day
 *
 * ✅ Used for:
 * - Daily background jobs
 * - Auto-generate recurring transactions
 * - Cleanup tasks
 */

// =======================================
// 🔁 Daily Recurring Transaction Job
// =======================================
cron.schedule("1 0 * * *", async () => {
  /**
   * 📄 Fetch active recurring transactions
   * Conditions:
   * - Must be active
   * - Start date should be today or earlier
   * - End date should be null or >= today
   * - Should not already run today
   */
  const [recurringList] = await db.query(
    `
    SELECT *
    FROM recurring_transactions
    WHERE is_active = 1
      AND start_date <= CURDATE()
      AND (end_date IS NULL OR end_date >= CURDATE())
      AND (last_run_date IS NULL OR last_run_date < CURDATE())
    `,
  );

  // 🔄 Loop through all valid recurring records
  for (const r of recurringList) {
    // 🧠 Frequency check
    if (!shouldRunToday(r.frequency, r.last_run_date)) continue;

    /**
     * ➕ Create a new transaction
     * Auto-generated from recurring rule
     */
    await db.query(
      `
      INSERT INTO transactions
      (user_id, category_id, amount, note, trn_date)
      VALUES (?, ?, ?, ?, CURDATE())
      `,
      [r.user_id, r.category_id, r.amount, r.note],
    );

    /**
     * 🔄 Update last run date
     * Prevents duplicate execution
     */
    await db.query(
      `
      UPDATE recurring_transactions
      SET last_run_date = CURDATE()
      WHERE recurring_id = ?
      `,
      [r.recurring_id],
    );
  }
});

// =======================================
// 🧠 Frequency Validation Helper
// =======================================
function shouldRunToday(frequency, lastRun) {
  // ▶️ First-time execution
  if (!lastRun) return true;

  const last = new Date(lastRun);
  const today = new Date(); // only for interval comparison

  switch (frequency) {
    case "DAILY":
      return true;

    case "WEEKLY":
      return today - last >= 7 * 24 * 60 * 60 * 1000;

    case "MONTHLY":
      return (
        today.getMonth() !== last.getMonth() ||
        today.getFullYear() !== last.getFullYear()
      );

    case "YEARLY":
      return today.getFullYear() !== last.getFullYear();

    default:
      return false;
  }
}
