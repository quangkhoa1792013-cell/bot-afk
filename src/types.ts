/** Các kiểu dữ liệu dùng chung toàn hệ thống. */

/** Email đã nhận, được lưu trong SQLite (messages table). */
export interface MessageRow {
  id: string;
  /** Địa chỉ người nhận (vd: test@khoablabla.ddns.net) */
  toAddr: string;
  /** Địa chỉ người gửi (vd: sender@gmail.com) */
  fromAddr: string;
  /** Tiêu đề email */
  subject: string;
  /** Nội dung plaintext (nếu có) */
  textBody: string | null;
  /** Nội dung HTML (nếu có) */
  htmlBody: string | null;
  /** Mã OTP phát hiện được, null nếu không có */
  otp: string | null;
  /** Danh sách link kích hoạt / URL phát hiện, JSON string */
  urlsJson: string | null;
  /** 0 = chưa đọc, 1 = đã đọc */
  read: number;
  /** 0 = bình thường, 1 = yêu thích/important */
  favorite: number;
  /** Timestamp (epoch ms) lúc nhận mail */
  receivedAt: number;
  /** Có attachment hay không (để hiển thị icon nhanh) */
  hasAttachments: number;
}

/** Attachment đã lưu trong SQLite (attachments table). */
export interface AttachmentRow {
  id: string;
  messageId: string;
  fileName: string;
  contentType: string;
  /** Kích thước tính bằng byte */
  size: number;
}

/** Email đã gửi từ dashboard (sent_mails table). */
export interface SentMailRow {
  id: string;
  toAddr: string;
  subject: string;
  body: string;
  /** 'ok' | 'error' + message */
  status: string;
  sentAt: number;
}

/** Cấu hình SMTP outbound (dùng để gửi mail từ dashboard). */
export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  /** Địa chỉ hiển thị ở From khi gửi */
  fromName: string;
}

/** Cấu hình Telegram Bot. */
export interface TelegramSettings {
  botToken: string;
  chatId: string;
}

/** Sự kiện mail mới phát ra qua event bus (dùng cho SSE + cần log). */
export interface NewMailEvent {
  message: MessageRow;
}