/**
 * Gửi 1 mail mẫu (có OTP) vào server để test nhanh.
 * - Tự tạo địa chỉ test@khoablabla.ddns.net nếu chưa có (qua API)
 * - Gửi mail vào SMTP port (mặc định 2525 - bản dev không cần sudo)
 * Dùng: npm run test:send
 */
'use strict';

const nodemailer = require('nodemailer');

const PORT = Number(process.env.SMTP_TEST_PORT ?? 2525);
const API = process.env.WEB_TEST_API ?? 'http://127.0.0.1:3000/api';
const NAME = (process.env.SMTP_TEST_NAME ?? 'test').toLowerCase();
const TO = `${NAME}@khoablabla.ddns.net`;

async function ensureMailbox() {
  const res = await fetch(`${API}/mailboxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NAME, note: 'Mail test tự động' }),
  });
  if (res.status === 409) return; // đã có rồi
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Không tạo được địa chỉ ${NAME}: ${err.error || res.status}`);
  }
  console.log(`   Đã tạo địa chỉ ${TO}`);
}

async function main() {
  await ensureMailbox();

  const smtp = nodemailer.createTransport({
    host: '127.0.0.1',
    port: PORT,
    secure: false,
    tls: { rejectUnauthorized: false },
  });

  await smtp.sendMail({
    from: 'shop-online@gmail.com',
    to: TO,
    subject: 'Mã xác nhận đăng nhập',
    text: 'Xin chào,\nMã xác nhận của bạn là: 482913\nMã có hiệu lực trong 5 phút.',
    attachments: [{ filename: 'huong-dan.txt', content: 'Day la file dinh kem mau.' }],
  });

  console.log(`✅ Đã gửi mail mẫu (OTP: 482913) tới ${TO} trên port ${PORT}`);
  console.log('   Mở dashboard để xem mail vừa đến.');
}

main().catch((err) => {
  console.error('❌ Gửi thất bại:', err.message);
  console.error('   Kiểm tra app đã chạy chưa (npm run dev) và SMTP_TEST_PORT có khớp không.');
  process.exit(1);
});