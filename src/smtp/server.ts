/**
 * SMTP Server: lắng nghe ở port 25 (cần sudo hoặc setcap).
 *
 * Đây là server NHẬN mail (MTA endpoint):
 *  - Catch-all: chấp nhận mọi địa chỉ *@* (kể cả domain lạ)
 *  - KHÔNG yêu cầu xác thực (temporary email, an toàn vì không relay mail đi đâu)
 *  - KHÔNG hỗ trợ gửi qua server này (disabled AUTH/STARTTLS để tránh bị lợi dụng)
 */
import { SMTPServer, type SMTPServerSession, type SMTPServerAddress } from 'smtp-server';
import { randomUUID } from 'node:crypto';
import { SMTP_HOST, SMTP_PORT, MAIL_DOMAIN, CATCH_ALL } from '../config';
import { parseRawMessage } from '../parser/message.parser';
import { insertMessage, isMailboxAllowed } from '../db/mail.repository';
import { bus } from '../events/bus';
import { notifyTelegram } from '../notifications/telegram';

/** Giới hạn dung lượng tối đa 1 email (25MB) để tránh spam nặng. */
const MAX_MESSAGE_SIZE = 25 * 1024 * 1024;

/** Số người nhận tối đa trong 1 mail. */
const MAX_RCPT = 50;

function log(msg: string): void {
  console.log(`[smtp] ${new Date().toISOString()} ${msg}`);
}

export async function startSmtpServer(): Promise<SMTPServer> {
  const server = new SMTPServer({
    // Không cần TLS/auth cho mail tạm thời
    disabledCommands: ['STARTTLS', 'AUTH'],
    authOptional: true,
    hideSTARTTLS: true,
    size: MAX_MESSAGE_SIZE,

    /**
     * Mọi kết nối đều được tiếp nhận.
     * Lưu ý: đây là server nhận mail tạm, KHÔNG mở relay - an toàn để lộ trên internet.
     */
    onConnect(session: SMTPServerSession, callback: (err?: Error) => void): void {
      log(`Client kết nối từ ${session.remoteAddress}`);
      callback();
    },

    /** HELO/EHLO: smtp-server xử lý mặc định, chấp nhận mọi hostname. */

    /** MAIL FROM: chấp nhận mọi địa chỉ gửi. */
    onMailFrom(address: SMTPServerAddress, session: SMTPServerSession, callback: (err?: Error) => void): void {
      session.envelope.mailFrom = address;
      log(`MAIL FROM: ${address.address}`);
      callback();
    },

    /**
     * RCPT TO: CHỈ chấp nhận địa chỉ đã tạo trong dashboard (vd: ten@khoablabla.ddns.net).
     * Địa chỉ lạ -> từ chối 550. Bật CATCH_ALL=true trong .env nếu muốn nhận mọi thứ.
     */
    onRcptTo(address: SMTPServerAddress, session: SMTPServerSession, callback: (err?: Error) => void): void {
      // Giới hạn số người nhận để tránh lạm dụng
      if (session.envelope.rcptTo.length >= MAX_RCPT) {
        return callback(new Error(`452 Too many recipients (max ${MAX_RCPT})`));
      }

      const addr = (address.address || '').toLowerCase();

      if (!CATCH_ALL) {
        const [local, domain] = addr.split('@');
        const allowed =
          local === 'postmaster' || // chuẩn SMTP, luôn nhận
          (domain === MAIL_DOMAIN && isMailboxAllowed(local));

        if (!allowed) {
          log(`TỪ CHỐI ${addr}: chưa tạo địa chỉ này (tạo trên dashboard -> Địa chỉ hòm thư)`);
          return callback(new Error(`550 Mailbox not found: ${address.address}`));
        }
      }

      session.envelope.rcptTo.push(address);
      log(`RCPT TO: ${address.address} (đã duyệt)`);
      callback();
    },

    /**
     * DATA: nhận toàn bộ nội dung mail rồi:
     * 1. Parse raw → các trường
     * 2. Lưu SQLite (+ attachments)
     * 3. Emit sự kiện 'new-mail' → SSE push + Telegram (không block luồng SMTP)
     */
    onData(stream: NodeJS.ReadableStream, session: SMTPServerSession, callback: (err?: Error) => void): void {
      const mailFrom = session.envelope.mailFrom ? session.envelope.mailFrom.address : undefined;
      log(`Bắt đầu nhận DATA từ ${mailFrom}`);

      const chunks: Buffer[] = [];
      let totalSize = 0;
      let tooLarge = false;

      stream.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_MESSAGE_SIZE) {
          tooLarge = true;
          stream.removeAllListeners('data');
          return;
        }
        chunks.push(chunk);
      });

      stream.on('end', () => {
        if (tooLarge) {
          log(`Từ chối mail quá ${MAX_MESSAGE_SIZE / 1024 / 1024}MB`);
          return callback(new Error('552 Message size exceeds fixed maximum message size'));
        }

        const raw = Buffer.concat(chunks);
        void handleIncomingMail(raw, session)
          .then(() => callback())
          .catch((err) => {
            log(`Lỗi xử lý mail: ${err instanceof Error ? err.message : String(err)}`);
            callback(new Error('Message processing failed'));
          });
      });

      stream.on('error', (err) => {
        log(`Lỗi DATA stream: ${err instanceof Error ? err.message : String(err)}`);
        callback(err);
      });
    },
  });

  // Tắt sẵn STARTTLS greeting để client không nhầm lẫn
  server.on('error', (err) => log(`Server error: ${err.message}`));

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(SMTP_PORT, SMTP_HOST, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  log(`SMTP server đang lắng nghe tại ${SMTP_HOST}:${SMTP_PORT}`);
  return server;
}

/** Toàn bộ pipeline xử lý 1 mail khi nhận đủ DATA. */
async function handleIncomingMail(raw: Buffer, session: SMTPServerSession): Promise<void> {
  const { input, attachments } = await parseRawMessage(raw);
  const saved = insertMessage(input, attachments);

  log(`Đã lưu mail: ${input.fromAddr} -> ${input.toAddr} | "${input.subject}" | OTP: ${input.otp ?? 'không có'}`);

  // Phát sự kiện để SSE push realtime
  bus.emit('new-mail', { id: saved.id });

  // Gửi Telegram song song, không đợi (thất bại chỉ log, không ảnh hưởng SMTP)
  void notifyTelegram(saved).catch((err) => {
    log(`Lỗi gửi Telegram: ${err instanceof Error ? err.message : String(err)}`);
  });
}