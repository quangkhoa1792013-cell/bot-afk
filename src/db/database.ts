/**
 * Khởi tạo SQLite database (dùng module built-in node:sqlite - không cần native dep).
 * Schema gồm 4 bảng:
 *  - messages:   email nhận được
 *  - attachments: file đính kèm (lưu BLOB)
 *  - sent_mails: email đã gửi từ dashboard
 *  - settings:   cấu hình (SMTP outbound, Telegram) dạng key-value JSON
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { DATA_DIR } from '../config';

export const DB_PATH = `${DATA_DIR}/mail.db`;

/** Singleton database connection. */
export let db: DatabaseSync;

/** Đảm bảo thư mục data tồn tại rồi mở database + tạo schema. */
export function initDatabase(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new DatabaseSync(DB_PATH);

  // WAL mode: đọc/ghi không blocked, tốt cho luồng SMTP + dashboard đồng thời
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id             TEXT PRIMARY KEY,
      to_addr        TEXT NOT NULL,
      from_addr      TEXT NOT NULL,
      subject        TEXT NOT NULL DEFAULT '',
      text_body      TEXT,
      html_body      TEXT,
      otp            TEXT,
      urls_json      TEXT,
      read           INTEGER NOT NULL DEFAULT 0,
      favorite       INTEGER NOT NULL DEFAULT 0,
      received_at    INTEGER NOT NULL,
      has_attachments INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id          TEXT PRIMARY KEY,
      message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      file_name   TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size        INTEGER NOT NULL DEFAULT 0,
      data        BLOB
    );

    CREATE TABLE IF NOT EXISTS sent_mails (
      id       TEXT PRIMARY KEY,
      to_addr  TEXT NOT NULL,
      subject  TEXT NOT NULL DEFAULT '',
      body     TEXT,
      status   TEXT NOT NULL,
      sent_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mailboxes (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      note       TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
  `);
}