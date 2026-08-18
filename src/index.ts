/**
 * Entry point: khởi động toàn bộ ứng dụng theo thứ tự:
 *  1. SQLite (bắt buộc trước - các service khác phụ thuộc)
 *  2. SMTP server (port 25 - cần sudo hoặc setcap)
 *  3. Web server (API + dashboard)
 *  4. Janitor (dọn mail cũ định kỳ)
 */
import { initDatabase, db } from './db/database';
import { startSmtpServer } from './smtp/server';
import { startWebServer } from './api/app';
import { startJanitor } from './cleanup/janitor';
import { WEB_PORT } from './config';

async function main(): Promise<void> {
  console.log('==============================================');
  console.log('  Bot-mail: Temporary Email Receiver');
  console.log('==============================================');

  try {
    initDatabase();
    console.log('[db] SQLite sẵn sàng: data/mail.db');
  } catch (err) {
    console.error('[db] Khởi tạo lỗi, app thoát:', err);
    process.exit(1);
  }

  // Cảnh báo sớm nếu DB bị readonly (vd: lần trước chạy bằng sudo -> file do root sở hữu)
  try {
    db.exec('CREATE TABLE IF NOT EXISTS _write_probe (x INTEGER); DROP TABLE _write_probe;');
  } catch {
    console.warn('[db] CẢNH BÁO: database đang ở chế độ chỉ đọc (data/mail.db do user khác sở hữu).');
    console.warn('[db] Sửa: sudo chown -R $USER data  hoặc  sudo rm -rf data');
  }

  try {
    await startSmtpServer();
  } catch (err) {
    console.error(
      `[smtp] Không bind được port 25. Nếu chưa chạy bằng sudo, hãy xem README.`,
      err instanceof Error ? err.message : String(err),
    );
    console.error('[smtp] Khởi động lại web server...');
  }

  try {
    await startWebServer();
  } catch (err) {
    console.error('[web] Lỗi khởi động web server:', err);
    process.exit(1);
  }

  startJanitor();
  console.log(`[app] Sẵn sàng! Dashboard: http://localhost:${WEB_PORT}`);
}

main().catch((err) => {
  console.error('Lỗi không mong muốn, app thoát:', err);
  process.exit(1);
});

// Tắt server sạch sẽ khi Ctrl+C / SIGTERM (systemd stop)
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));