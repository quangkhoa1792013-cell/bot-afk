/** Nạp cấu hình từ biến môi trường (file .env) với giá trị mặc định an toàn. */
import 'dotenv/config';
import path from 'node:path';

/** Thư mục gốc của project (nơi chạy npm). Ổn định cả dev (tsx) lẫn prod (dist). */
export const ROOT_DIR = process.cwd();

/** Thư mục lưu dữ liệu (SQLite file data/mail.db). Có thể đổi qua env DATA_DIR. */
export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, 'data');

/** Port lắng nghe của SMTP server (mặc định 25 - chuẩn SMTP). */
export const SMTP_PORT = Number(process.env.SMTP_PORT ?? 25);

/** Interface máy để bind; 0.0.0.0 = nhận từ mọi nơi (cần thiết khi router forward). */
export const SMTP_HOST = process.env.SMTP_HOST ?? '0.0.0.0';

/** Port của Web dashboard / API. */
export const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);

/** Port API lắng nghe. */
export const WEB_HOST = process.env.WEB_HOST ?? '0.0.0.0';

/** Thời gian sống (giờ) của mail trước khi bị janitor dọn dẹp. Mặc định 24h. */
export const MAIL_TTL_HOURS = Number(process.env.MAIL_TTL_HOURS ?? 24);

/** Khoảng thời gian (phút) janitor chạy 1 lần. */
export const CLEANUP_INTERVAL_MIN = Number(process.env.CLEANUP_INTERVAL_MIN ?? 60);

/** Có bật Telegram hay không (app vẫn chạy bình thường nếu để trống). */
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

/** Secret dùng để xác thực các API thay đổi nếu cần (optional, đang bỏ trống). */
export const API_SECRET = process.env.API_SECRET ?? '';

/** Domain nhận mail: chỉ chấp nhận mail tới <name>@MAIL_DOMAIN. */
export const MAIL_DOMAIN = process.env.MAIL_DOMAIN ?? 'khoablabla.ddns.net';

/**
 * Chế độ catch-all: nếu true, chấp nhận MỌI địa chỉ *@* kể cả domain lạ.
 * Mặc định FALSE - chỉ nhận mail tới các địa chỉ đã tạo trong dashboard.
 */
export const CATCH_ALL = process.env.CATCH_ALL === 'true';