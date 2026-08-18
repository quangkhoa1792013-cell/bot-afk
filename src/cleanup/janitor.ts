/**
 * Janitor: dọn dẹp định kỳ.
 * Xóa các mail (và attachment theo cascade) cũ hơn MAIL_TTL_HOURS (mặc định 24h).
 */
import { deleteMessagesOlderThan } from '../db/mail.repository';
import { MAIL_TTL_HOURS, CLEANUP_INTERVAL_MIN } from '../config';

let started = false;

/** Đăng ký timer dọn dẹp (chạy 1 lần khi app khởi động). */
export function startJanitor(): void {
  if (started) return;
  started = true;

  const runCleanup = (): number => {
    try {
      const cutoff = Date.now() - MAIL_TTL_HOURS * 3600 * 1000;
      const removed = deleteMessagesOlderThan(cutoff);
      if (removed > 0) {
        console.log(`[janitor] Đã dọn ${removed} mail cũ (TTL ${MAIL_TTL_HOURS}h)`);
      }
      return removed;
    } catch (err) {
      // Không để lỗi dọn dẹp (vd: DB readonly do quyền file) làm chết cả app
      console.warn(`[janitor] Dọn dẹp thất bại (kiểm tra quyền ghi data/mail.db): ${err instanceof Error ? err.message : String(err)}`);
      return 0;
    }
  };

  // Chạy 1 lần ngay khi khởi động (quét mail tồn từ lần chạy trước vì tắt máy)
  runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MIN * 60 * 1000);
  console.log(`[janitor] Dọn dẹp mail sau ${MAIL_TTL_HOURS}h, kiểm tra mỗi ${CLEANUP_INTERVAL_MIN} phút`);
}