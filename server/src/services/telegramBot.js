const TelegramBot = require('node-telegram-bot-api');

let bot = null;
let chatId = null;

/**
 * Initialize the Telegram bot with token and chat ID from environment variables.
 */
function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[Telegram] Bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env');
    return;
  }

  try {
    bot = new TelegramBot(token, { polling: true });
    console.log('[Telegram] Bot initialized successfully');

    // Handle /start command
    bot.onText(/\/start/, (msg) => {
      const msgChatId = msg.chat.id;
      console.log(`[Telegram] Received /start from Chat ID: ${msgChatId}`);
      bot.sendMessage(msgChatId,
        '🚗 *VinFast Station Sync Bot*\n\n' +
        'Các lệnh có sẵn:\n' +
        '/sync - Chạy cập nhật trạm sạc ngay\n' +
        '/status - Xem trạng thái sync gần nhất\n' +
        '/history - Xem lịch sử 5 lần sync\n' +
        '/help - Hiển thị trợ giúp',
        { parse_mode: 'Markdown' }
      );
    });

    // Handle /help command
    bot.onText(/\/help/, (msg) => {
      const msgChatId = msg.chat.id;
      bot.sendMessage(msgChatId,
        '📖 *Hướng dẫn sử dụng*\n\n' +
        '**/sync** - Kích hoạt cập nhật trạm sạc thủ công\n' +
        '**/status** - Kiểm tra trạng thái sync gần nhất\n' +
        '**/history** - Xem lịch sử các lần sync\n\n' +
        '🔔 Bot sẽ tự động thông báo khi có cập nhật trạm sạc mới',
        { parse_mode: 'Markdown' }
      );
    });

    // Handle /sync command - trigger manual sync
    bot.onText(/\/sync/, async (msg) => {
      const msgChatId = msg.chat.id;

      // Only allow authorized chat
      if (msgChatId.toString() !== chatId) {
        bot.sendMessage(msgChatId, '❌ Bạn không có quyền sử dụng lệnh này');
        return;
      }

      bot.sendMessage(msgChatId, '⏳ Đang bắt đầu cập nhật trạm sạc...');

      // Import here to avoid circular dependency
      const { runSync } = require('../scheduler/stationSync');

      try {
        const result = await runSync();
        // Notification will be sent by the sync function itself
      } catch (err) {
        bot.sendMessage(msgChatId, `❌ Lỗi khi cập nhật: ${err.message}`);
      }
    });

    // Handle /status command
    bot.onText(/\/status/, (msg) => {
      const msgChatId = msg.chat.id;

      if (msgChatId.toString() !== chatId) {
        bot.sendMessage(msgChatId, '❌ Bạn không có quyền sử dụng lệnh này');
        return;
      }

      const { getLastSyncResult } = require('../scheduler/stationSync');
      const lastResult = getLastSyncResult();

      if (!lastResult) {
        bot.sendMessage(msgChatId, '📊 Chưa có lần sync nào kể từ khi server khởi động');
        return;
      }

      let message = '📊 *Trạng thái sync gần nhất*\n\n';
      message += `⏰ Thời gian: ${new Date(lastResult.timestamp).toLocaleString('vi-VN')}\n`;
      message += `⏱ Thời lượng: ${lastResult.durationSeconds}s\n`;

      if (lastResult.success) {
        message += `✅ Trạng thái: Thành công\n`;
        message += `📍 Số trạm: ${lastResult.count}\n`;

        if (lastResult.hasChanges) {
          message += `\n📝 Thay đổi:\n`;
          message += `  ➕ Thêm mới: ${lastResult.diff.added}\n`;
          message += `  ➖ Xóa: ${lastResult.diff.removed}\n`;
          message += `  🔄 Sửa đổi: ${lastResult.diff.modified}\n`;
          message += `  ✔️ Không đổi: ${lastResult.diff.unchanged}`;
        } else {
          message += `\n✔️ Không có thay đổi`;
        }
      } else {
        message += `❌ Trạng thái: Thất bại\n`;
        message += `⚠️ Lỗi: ${lastResult.error}`;
      }

      bot.sendMessage(msgChatId, message, { parse_mode: 'Markdown' });
    });

    // Handle /history command
    bot.onText(/\/history/, (msg) => {
      const msgChatId = msg.chat.id;

      if (msgChatId.toString() !== chatId) {
        bot.sendMessage(msgChatId, '❌ Bạn không có quyền sử dụng lệnh này');
        return;
      }

      const { getSyncHistory } = require('../scheduler/stationSync');
      const history = getSyncHistory();

      if (history.length === 0) {
        bot.sendMessage(msgChatId, '📜 Chưa có lịch sử sync');
        return;
      }

      let message = '📜 *Lịch sử sync (5 lần gần nhất)*\n\n';

      history.slice(0, 5).forEach((item, index) => {
        const time = new Date(item.timestamp).toLocaleString('vi-VN');
        const status = item.success ? '✅' : '❌';
        message += `${index + 1}. ${status} ${time}\n`;

        if (item.success && item.hasChanges) {
          message += `   +${item.diff.added} -${item.diff.removed} ~${item.diff.modified}\n`;
        } else if (item.success) {
          message += `   Không có thay đổi\n`;
        } else {
          message += `   Lỗi: ${item.error}\n`;
        }
        message += '\n';
      });

      bot.sendMessage(msgChatId, message, { parse_mode: 'Markdown' });
    });

  } catch (err) {
    console.error('[Telegram] Failed to initialize bot:', err.message);
  }
}

/**
 * Send a notification message to the configured chat.
 */
async function sendNotification(message, options = {}) {
  if (!bot || !chatId) {
    console.log('[Telegram] Bot not configured, skipping notification');
    return;
  }

  try {
    await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...options });
  } catch (err) {
    console.error('[Telegram] Failed to send notification:', err.message);
  }
}

/**
 * Send a sync result notification with formatted details.
 */
async function sendSyncNotification(result) {
  if (!bot || !chatId) return;

  let message = '🔔 *Cập nhật trạm sạc*\n\n';

  if (result.success) {
    if (result.hasChanges) {
      message += `✅ Đã cập nhật thành công!\n\n`;
      message += `📍 Tổng số trạm: ${result.count} (${result.count > result.previousCount ? '+' : ''}${result.count - result.previousCount})\n\n`;
      message += `📝 Chi tiết:\n`;
      message += `  ➕ Thêm mới: ${result.diff.added}\n`;
      message += `  ➖ Xóa: ${result.diff.removed}\n`;
      message += `  🔄 Sửa đổi: ${result.diff.modified}\n`;
      message += `  ✔️ Không đổi: ${result.diff.unchanged}\n\n`;
      message += `⏱ Thời gian: ${result.durationSeconds}s`;
    } else {
      message += `✅ Đã kiểm tra - không có thay đổi\n\n`;
      message += `📍 Số trạm hiện tại: ${result.count}\n`;
      message += `⏱ Thời gian: ${result.durationSeconds}s`;
    }
  } else {
    message += `❌ Cập nhật thất bại\n\n`;
    message += `⚠️ Lỗi: ${result.error}\n`;
    message += `⏱ Thời gian: ${result.durationSeconds}s`;
  }

  await sendNotification(message);
}

/**
 * Stop the bot (for graceful shutdown).
 */
function stopBot() {
  if (bot) {
    bot.stopPolling();
    console.log('[Telegram] Bot stopped');
  }
}

module.exports = {
  initTelegramBot,
  sendNotification,
  sendSyncNotification,
  stopBot,
};
