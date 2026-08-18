/**
 * Telegram Notification Service:
 * Mỗi khi có mail mới, gửi tin nhắn về chat Telegram qua Bot API (fetch, không cần thư viện).
 *
 * Cấu hình ưu tiên: settings table (chỉnh từ UI) -> env vars (.env)
 */
import { getSetting, setSetting } from '../db/mail.repository';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from '../config';
import type { MessageRow, TelegramSettings } from '../types';

export const SETTING_KEY = 'telegram';

/** Lấy settings Telegram hiện tại: DB trước, env sau (fallback). */
export function getActiveTelegramSettings(): TelegramSettings | null {
  const fromDb = getSetting<TelegramSettings>(SETTING_KEY);
  if (fromDb?.botToken && fromDb?.chatId) return fromDb;
  if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    return { botToken: TELEGRAM_BOT_TOKEN, chatId: TELEGRAM_CHAT_ID };
  }
  return null;
}

export function saveTelegramSettings(settings: TelegramSettings): void {
  setSetting(SETTING_KEY, settings);
}

/** Escape các ký tự đặc biệt cho parse_mode HTML của Telegram (tránh XSS/gãy cấu trúc). */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Format tin nhắn Telegram theo yêu cầu: mail tới, từ, tiêu đề, mã OTP. */
function buildTelegramText(message: MessageRow): string {
  const otp = message.otp ?? 'Không có';
  const lines = [
    `📩 Mail tới: ${escapeHtml(message.toAddr)}`,
    `👤 Từ: ${escapeHtml(message.fromAddr)}`,
    `📌 Tiêu đề: ${escapeHtml(message.subject || '(không có tiêu đề)')}`,
    `🔑 Mã OTP phát hiện: <b>${escapeHtml(otp)}</b>`,
  ];

  // Kèm link kích hoạt nếu có (dùng extractor lưu sẵn trong urlsJson)
  if (message.urlsJson) {
    try {
      const urls: string[] = JSON.parse(message.urlsJson);
      if (urls.length) lines.push(`🔗 Link: ${escapeHtml(urls[0])}`);
    } catch {
      // bỏ qua nếu JSON lỗi
    }
  }

  return lines.join('\n');
}

/**
 * Gửi thông báo Telegram cho 1 mail vừa nhận (có retry 2 lần, mỗi lần cách 3s).
 * Không throw ra ngoài - thất bại chỉ log warn.
 */
export async function notifyTelegram(message: MessageRow): Promise<boolean> {
  const settings = getActiveTelegramSettings();
  if (!settings) {
    console.warn('[telegram] Chưa cấu hình bot token / chat id, bỏ qua gửi. (đặt trong .env hoặc /api/settings)');
    return false;
  }

  const text = buildTelegramText(message);
  const url = `https://api.telegram.org/bot${settings.botToken}/sendMessage`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      if (res.ok) {
        console.log(`[telegram] Đã gửi thông báo cho mail ${message.id}`);
        return true;
      }
      console.warn(`[telegram] Telegram trả về ${res.status}: ${await res.text()}`);
    } catch (err) {
      console.warn(`[telegram] Lỗi lần ${attempt}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}