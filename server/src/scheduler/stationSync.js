const cron = require('node-cron');
const { importKmlStations } = require('../database/fetchKmlStations');
const { sendSyncNotification } = require('../services/telegramBot');

let lastSyncResult = null;
let syncHistory = []; // Keep last 10 sync results
let scheduledTask = null;

const MAX_HISTORY = 10;

/**
 * Start the weekly station sync scheduler.
 * Runs every Monday at 3:00 AM (Vietnam time, UTC+7).
 * Also runs once on server startup after a 30-second delay.
 */
function startStationSyncScheduler() {
  // Weekly cron: every Monday at 03:00 AM
  scheduledTask = cron.schedule('0 3 * * 1', async () => {
    console.log('[Scheduler] ═══ Weekly station sync triggered ═══');
    await runSync();
  }, {
    timezone: 'Asia/Ho_Chi_Minh'
  });

  console.log('[Scheduler] Station sync scheduled: every Monday at 03:00 AM (Asia/Ho_Chi_Minh)');

  // Also run once on startup after 30s delay (let server fully boot first)
  setTimeout(async () => {
    console.log('[Scheduler] Running initial station sync on startup...');
    await runSync();
  }, 30_000);
}

/**
 * Run the KML sync. Safe to call manually or from the cron job.
 * Returns the sync result including diff details.
 */
async function runSync() {
  const startTime = Date.now();
  try {
    const result = await importKmlStations();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    lastSyncResult = {
      ...result,
      timestamp: new Date().toISOString(),
      durationSeconds: parseFloat(duration),
    };

    // Pretty log the diff summary
    if (result.hasChanges) {
      console.log(`[Scheduler] ✅ Sync completed in ${duration}s — ${result.previousCount} → ${result.count} stations`);
      console.log(`[Scheduler]    +${result.diff.added} added | -${result.diff.removed} removed | ~${result.diff.modified} modified | =${result.diff.unchanged} unchanged`);
      if (result.backupFile) {
        console.log(`[Scheduler]    📦 Backup: ${result.backupFile}`);
      }
    } else {
      console.log(`[Scheduler] ✅ Sync completed in ${duration}s — No changes (${result.count} stations)`);
    }

    // Push to history
    syncHistory.unshift(lastSyncResult);
    if (syncHistory.length > MAX_HISTORY) syncHistory.pop();

    // Send Telegram notification
    await sendSyncNotification(lastSyncResult);

    return lastSyncResult;
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Scheduler] ❌ Sync failed in ${duration}s:`, err.message);

    lastSyncResult = {
      success: false,
      error: err.message,
      timestamp: new Date().toISOString(),
      durationSeconds: parseFloat(duration),
    };

    syncHistory.unshift(lastSyncResult);
    if (syncHistory.length > MAX_HISTORY) syncHistory.pop();

    // Send Telegram notification for errors too
    await sendSyncNotification(lastSyncResult);

    return lastSyncResult;
  }
}

/**
 * Get the last sync result (for the status API endpoint).
 */
function getLastSyncResult() {
  return lastSyncResult;
}

/**
 * Get sync history (last N sync results).
 */
function getSyncHistory() {
  return syncHistory;
}

/**
 * Stop the scheduler (for graceful shutdown).
 */
function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    console.log('[Scheduler] Station sync scheduler stopped');
  }
}

module.exports = {
  startStationSyncScheduler,
  runSync,
  getLastSyncResult,
  getSyncHistory,
  stopScheduler,
};
