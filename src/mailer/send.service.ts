/**
 * Mail Sender: gửi email ra ngoài từ dashboard.
 * Dùng nodemailer kết nối SMTP provider (vd: Gmail, Outlook, Zoho... port 587/465).
 *
 * Cấu hình lưu trong settings table (chỉnh được từ UI), fallback env hoặc rỗng.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { getSetting, setSetting, insertSentMail } from '../db/mail.repository';
import type { SmtpSettings } from '../types';

export const SETTING_KEY = 'smtp';

/** Settings SMTP outbound hiện tại: DB trước, env fallback (rỗng nếu chưa có). */
export function getActiveSmtpSettings(): SmtpSettings {
  const fromDb = getSetting<SmtpSettings>(SETTING_KEY);
  if (fromDb) return fromDb;
  return {
    host: process.env.SMTP_OUT_HOST ?? '',
    port: Number(process.env.SMTP_OUT_PORT ?? 587),
    secure: process.env.SMTP_OUT_SECURE === 'true',
    user: process.env.SMTP_OUT_USER ?? '',
    pass: process.env.SMTP_OUT_PASS ?? '',
    fromName: process.env.SMTP_OUT_FROM_NAME ?? '',
  };
}

export function saveSmtpSettings(settings: SmtpSettings): void {
  setSetting(SETTING_KEY, settings);
}

/** Tạo transporter lazily mỗi lần gửi (để luôn dùng settings mới nhất). */
function createTransporter(): Transporter | null {
  const s = getActiveSmtpSettings();
  if (!s.host || !s.user) return null;

  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure, // true = port 465 (SSL), false = STARTTLS 587
    auth: s.user && s.pass ? { user: s.user, pass: s.pass } : undefined,
    // Giới hạn thử lại để không treo request lâu
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Kiểm tra kết nối SMTP (nút "Test connection" trên UI). */
export async function testSmtpConnection(): Promise<{ ok: boolean; message: string }> {
  const transporter = createTransporter();
  if (!transporter) return { ok: false, message: 'Chưa cấu hình SMTP (host/user) trong cài đặt' };
  try {
    await transporter.verify();
    return { ok: true, message: 'Kết nối SMTP thành công' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Payload gửi mail từ dashboard. */
export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
}

/** Gửi mail + lưu vào hộp "đã gửi". Ném lỗi nếu thất bại. */
export async function sendMail(input: SendMailInput): Promise<void> {
  const transporter = createTransporter();
  if (!transporter) {
    throw new Error('Chưa cấu hình SMTP outbound. Vào Cài đặt để nhập host/port/user/pass của nhà cung cấp email.');
  }

  const s = getActiveSmtpSettings();
  const fromAddr = s.user;
  const fromLabel = s.fromName?.trim() ? `"${s.fromName}" <${fromAddr}>` : fromAddr;

  const info = await transporter.sendMail({
    from: fromLabel,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html || undefined,
  });

  insertSentMail({
    id: randomUUID(),
    toAddr: input.to,
    subject: input.subject,
    body: input.text,
    status: info.messageId ? `ok (${info.messageId})` : 'ok',
    sentAt: Date.now(),
  });
}