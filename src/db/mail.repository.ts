/**
 * Mail repository: toàn bộ thao tác CRUD với SQLite.
 * Dùng prepared statements để tránh SQL injection.
 *
 * Lưu ý: node:sqlite trả về bigint cho cột INTEGER khi vượt Number.MAX_SAFE_INTEGER
 * và type trả về là number|bigint, nên mọi dòng phải được map qua các hàm mapper.
 */
import { randomUUID } from 'node:crypto';
import { db } from './database';
import type { MessageRow, AttachmentRow, SentMailRow } from '../types';

/** Nguồn dữ liệu mới nhận từ SMTP, trước khi insert. */
export interface NewMessageInput {
  id: string;
  toAddr: string;
  fromAddr: string;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  otp: string | null;
  urls: string[] | null;
  receivedAt: number;
}

export interface NewAttachmentInput {
  fileName: string;
  contentType: string;
  data: Buffer;
}

/** Điều kiện lọc khi liệt kê mail. */
export interface ListMessagesOptions {
  search?: string;
  folder?: 'inbox' | 'unread' | 'favorite';
  /** Lọc theo địa chỉ hòm thư: chỉ lấy mail tới <mailbox>@domain */
  mailbox?: string;
  limit?: number;
  offset?: number;
}

/** Kiểm tra bảng đã được khởi tạo chưa. */
function requireDb(): void {
  if (!db) throw new Error('Database chưa được khởi tạo. Gọi initDatabase() trước.');
}

/** An toàn chuyển number|bigint thành number. */
function toNum(v: unknown): number {
  if (v == null) return 0;
  return typeof v === 'bigint' ? Number(v) : Number(v);
}

/** Map 1 dòng SQLite thành MessageRow. */
/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToMessage(row: Record<string, any>): MessageRow {
  return {
    id: String(row.id),
    toAddr: String(row.toAddr),
    fromAddr: String(row.fromAddr),
    subject: String(row.subject ?? ''),
    textBody: row.textBody == null ? null : String(row.textBody),
    htmlBody: row.htmlBody == null ? null : String(row.htmlBody),
    otp: row.otp == null ? null : String(row.otp),
    urlsJson: row.urlsJson == null ? null : String(row.urlsJson),
    read: toNum(row.read),
    favorite: toNum(row.favorite),
    receivedAt: toNum(row.receivedAt),
    hasAttachments: toNum(row.hasAttachments),
  };
}

/** Lưu email mới (kèm attachments trong cùng transaction). */
export function insertMessage(input: NewMessageInput, attachments: NewAttachmentInput[] = []): MessageRow {
  requireDb();
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, to_addr, from_addr, subject, text_body, html_body, otp, urls_json, read, favorite, received_at, has_attachments)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    insertMsg.run(
      input.id,
      input.toAddr,
      input.fromAddr,
      input.subject,
      input.textBody,
      input.htmlBody,
      input.otp,
      input.urls?.length ? JSON.stringify(input.urls) : null,
      input.receivedAt,
      attachments.length ? 1 : 0,
    );

    const insertAtt = db.prepare(`
      INSERT INTO attachments (id, message_id, file_name, content_type, size, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const att of attachments) {
      insertAtt.run(randomUUID(), input.id, att.fileName, att.contentType, att.data.length, att.data);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return getMessage(input.id)!;
}

const MESSAGE_COLUMNS = `
  SELECT id, to_addr AS toAddr, from_addr AS fromAddr, subject,
         text_body AS textBody, html_body AS htmlBody, otp,
         urls_json AS urlsJson, read, favorite, received_at AS receivedAt,
         has_attachments AS hasAttachments
  FROM messages
`;

/** Liệt kê mail theo folder + search keyword, mới nhất trước. */
export function listMessages(opts: ListMessagesOptions = {}): MessageRow[] {
  requireDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.folder === 'unread') where.push('read = 0');
  if (opts.folder === 'favorite') where.push('favorite = 1');

  if (opts.search) {
    const like = `%${opts.search}%`;
    // Tìm theo người gửi, tiêu đề, nội dung hoặc mã OTP
    where.push('(from_addr LIKE ? OR subject LIKE ? OR text_body LIKE ? OR otp LIKE ?)');
    params.push(like, like, like, like);
  }

  if (opts.mailbox) {
    // Chỉ lấy mail gửi tới địa chỉ <mailbox>@<domain>
    where.push('to_addr LIKE ?');
    params.push(`%${opts.mailbox}@%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  params.push(limit, offset);

  const rows = db.prepare(`
    ${MESSAGE_COLUMNS}
    ${whereSql}
    ORDER BY received_at DESC
    LIMIT ? OFFSET ?
  `).all(...params as (string | number)[]);

  return rows.map(rowToMessage);
}

/** Lấy chi tiết 1 mail theo id. */
export function getMessage(id: string): MessageRow | null {
  requireDb();
  const row = db.prepare(`${MESSAGE_COLUMNS} WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined;
  return row ? rowToMessage(row) : null;
}

/** Danh sách attachment metadata của 1 mail (không kèm dữ liệu BLOB). */
export function listAttachments(messageId: string): AttachmentRow[] {
  requireDb();
  const rows = db.prepare(`
    SELECT id, message_id AS messageId, file_name AS fileName,
           content_type AS contentType, size
    FROM attachments WHERE message_id = ?
  `).all(messageId) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    messageId: String(r.messageId),
    fileName: String(r.fileName),
    contentType: String(r.contentType),
    size: toNum(r.size),
  }));
}

/** Lấy nội dung BLOB của 1 attachment cụ thể. */
export function getAttachmentData(messageId: string, attachmentId: string): { meta: AttachmentRow; data: Buffer } | null {
  requireDb();
  const row = db.prepare(`
    SELECT id, message_id AS messageId, file_name AS fileName,
           content_type AS contentType, size, data
    FROM attachments WHERE id = ? AND message_id = ?
  `).get(attachmentId, messageId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const meta: AttachmentRow = {
    id: String(row.id),
    messageId: String(row.messageId),
    fileName: String(row.fileName),
    contentType: String(row.contentType),
    size: toNum(row.size),
  };
  // node:sqlite trả Uint8Array => chuyển thành Buffer để Express gửi nhị phân đúng cách
  const data = Buffer.from(row.data as Uint8Array);
  return { meta, data };
}

/** Đánh dấu đã đọc / chưa đọc. */
export function setMessageRead(id: string, read: boolean): void {
  requireDb();
  db.prepare('UPDATE messages SET read = ? WHERE id = ?').run(read ? 1 : 0, id);
}

/** Đánh dấu yêu thích / bỏ yêu thích. */
export function setMessageFavorite(id: string, favorite: boolean): void {
  requireDb();
  db.prepare('UPDATE messages SET favorite = ? WHERE id = ?').run(favorite ? 1 : 0, id);
}

/** Xóa 1 mail + attachments theo cascade. */
export function deleteMessage(id: string): boolean {
  requireDb();
  const res = db.prepare('DELETE FROM messages WHERE id = ?').run(id);
  return res.changes > 0;
}

/** Xóa toàn bộ mail + attachments (không xóa sent_mails/settings). */
export function clearAllMessages(): number {
  requireDb();
  const res = db.prepare('DELETE FROM messages').run();
  return toNum(res.changes);
}

/** Dọn dẹp: xóa mọi mail nhận trước mốc thời gian (dùng cho TTL 24h). */
export function deleteMessagesOlderThan(ms: number): number {
  requireDb();
  const res = db.prepare('DELETE FROM messages WHERE received_at < ?').run(ms);
  return toNum(res.changes);
}

/** Đếm tổng số mail (cho header hiển thị). */
export function countMessages(): number {
  requireDb();
  const row = db.prepare('SELECT COUNT(*) AS c FROM messages').get() as { c: number | bigint };
  return toNum(row.c);
}

// ---------------- Sent mail (hộp "đã gửi") ----------------

/** Lưu 1 bản ghi mail đã gửi từ dashboard. */
export function insertSentMail(input: { id: string; toAddr: string; subject: string; body: string; status: string; sentAt: number }): void {
  requireDb();
  db.prepare('INSERT INTO sent_mails (id, to_addr, subject, body, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(input.id, input.toAddr, input.subject, input.body, input.status, input.sentAt);
}

/** Liệt kê mail đã gửi, mới nhất trước. */
export function listSentMails(limit = 100): SentMailRow[] {
  requireDb();
  const rows = db.prepare(`
    SELECT id, to_addr AS toAddr, subject, body, status, sent_at AS sentAt
    FROM sent_mails ORDER BY sent_at DESC LIMIT ?
  `).all(Math.min(limit, 500)) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    toAddr: String(r.toAddr),
    subject: String(r.subject ?? ''),
    body: r.body == null ? '' : String(r.body),
    status: String(r.status),
    sentAt: toNum(r.sentAt),
  }));
}

/** Xóa 1 mail đã gửi. */
export function deleteSentMail(id: string): boolean {
  requireDb();
  return db.prepare('DELETE FROM sent_mails WHERE id = ?').run(id).changes > 0;
}

// ---------------- Mailboxes (địa chỉ hòm thư tạo trong dashboard) ----------------

export interface MailboxRow {
  id: string;
  name: string;
  note: string;
  createdAt: number;
  /** Số mail đã nhận tới địa chỉ này (ước lượng bằng LIKE trên to_addr). */
  mailCount: number;
}

/** Kiểm tra địa chỉ local part (phần trước @) đã được tạo chưa. */
export function isMailboxAllowed(localName: string): boolean {
  requireDb();
  const row = db.prepare('SELECT 1 FROM mailboxes WHERE name = ?').get(localName.toLowerCase());
  return !!row;
}

/** Danh sách mailbox, kèm số mail đã nhận, mới tạo trước. */
export function listMailboxes(domain: string): MailboxRow[] {
  requireDb();
  const rows = db.prepare(`
    SELECT m.id, m.name, m.note, m.created_at AS createdAt,
           (SELECT COUNT(*) FROM messages
             WHERE to_addr LIKE '%' || m.name || '@' || ? || '%') AS mailCount
    FROM mailboxes m
    ORDER BY m.created_at DESC
  `).all(domain) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    note: String(r.note ?? ''),
    createdAt: toNum(r.createdAt),
    mailCount: toNum(r.mailCount),
  }));
}

/** Tạo mailbox. Ném lỗi 'EXISTS' nếu tên đã có. */
export function createMailbox(name: string, note: string): MailboxRow {
  requireDb();
  const id = randomUUID();
  try {
    db.prepare('INSERT INTO mailboxes (id, name, note, created_at) VALUES (?, ?, ?, ?)')
      .run(id, name.toLowerCase(), note, Date.now());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) throw new Error('EXISTS');
    throw err;
  }
  const row = db.prepare('SELECT id, name, note, created_at AS createdAt, 0 AS mailCount FROM mailboxes WHERE id = ?')
    .get(id) as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name),
    note: String(row.note ?? ''),
    createdAt: toNum(row.createdAt),
    mailCount: 0,
  };
}

/** Sửa tên (đổi địa chỉ) và/hoặc ghi chú. Ném 'EXISTS' nếu tên mới trùng. */
export function updateMailbox(id: string, patch: { name?: string; note?: string }): void {
  requireDb();
  const current = db.prepare('SELECT id, name, note FROM mailboxes WHERE id = ?').get(id) as
    { id: string; name: string; note: string } | undefined;
  if (!current) throw new Error('NOT_FOUND');

  const newName = (patch.name ?? current.name).toLowerCase();
  const newNote = patch.note ?? current.note;

  try {
    db.prepare('UPDATE mailboxes SET name = ?, note = ? WHERE id = ?').run(newName, newNote, id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) throw new Error('EXISTS');
    throw err;
  }
}

/** Xóa mailbox (mail đã nhận trước đó vẫn giữ nguyên trong hòm thư). */
export function deleteMailbox(id: string): boolean {
  requireDb();
  return toNum(db.prepare('DELETE FROM mailboxes WHERE id = ?').run(id).changes) > 0;
}

// ---------------- Settings ----------------

/** Đọc 1 key trong bảng settings (trả null nếu chưa có). */
export function getSetting<T>(key: string): T | null {
  requireDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

/** Ghi 1 key trong bảng settings (upsert). */
export function setSetting(key: string, value: unknown): void {
  requireDb();
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}