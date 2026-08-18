/**
 * API routes: quản lý email nhận được (list, detail, read/favorite, delete, download attachment).
 * Mọi response đều JSON.
 */
import { Router } from 'express';
import {
  listMessages, getMessage, setMessageRead, setMessageFavorite,
  deleteMessage, clearAllMessages, listAttachments, getAttachmentData,
  countMessages,
} from '../../db/mail.repository';
import { bus } from '../../events/bus';
import { MAIL_DOMAIN } from '../../config';

export const mailsRouter = Router();

/** Bảng MIME theo đuôi file - dùng khi tự động nhận diện loại file đính kèm. */
const MIME_BY_EXT: Record<string, string> = {
  txt: 'text/plain', text: 'text/plain', log: 'text/plain', md: 'text/markdown',
  html: 'text/html', htm: 'text/html', css: 'text/css', csv: 'text/csv',
  json: 'application/json', xml: 'application/xml', js: 'text/javascript',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar', gz: 'application/gzip', gz2: 'application/gzip',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  eml: 'message/rfc822', msg: 'application/vnd.ms-outlook',
  apk: 'application/vnd.android.package-archive',
};

function mimeByExt(fileName: string): string | undefined {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

/** GET /api/mails?search=...&folder=inbox|unread|favorite&mailbox=ten&limit=...&offset=... */
mailsRouter.get('/', (req, res) => {
  const folder = (req.query.folder as string) || 'inbox';
  const search = (req.query.search as string)?.trim() || undefined;
  // Lọc theo địa chỉ hòm thư: chỉ lấy mail gửi tới ten@MAIL_DOMAIN
  const mailbox = (req.query.mailbox as string)?.trim().toLowerCase() || undefined;

  if (!['inbox', 'unread', 'favorite'].includes(folder)) {
    return res.status(400).json({ error: `folder không hợp lệ: ${folder}` });
  }

  const limit = Number(req.query.limit ?? 100);
  const offset = Number(req.query.offset ?? 0);
  const messages = listMessages({
    folder: folder as 'inbox' | 'unread' | 'favorite',
    search,
    mailbox,
    limit,
    offset,
  });

  res.json({
    total: countMessages(),
    count: messages.length,
    messages,
  });
});

/** GET /api/stats - số liệu tổng cho sidebar badges. */
mailsRouter.get('/stats', (_req, res) => {
  res.json({
    total: countMessages(),
    unread: listMessages({ folder: 'unread', limit: 500 }).length,
    favorite: listMessages({ folder: 'favorite', limit: 500 }).length,
  });
});

/** GET /api/mails/:id - chi tiết 1 mail kèm biến urls thành mảng. */
mailsRouter.get('/:id', (req, res) => {
  const message = getMessage(req.params.id);
  if (!message) return res.status(404).json({ error: 'Mail không tồn tại' });

  const detail = {
    ...message,
    urls: message.urlsJson ? JSON.parse(message.urlsJson) : [],
    attachments: listAttachments(message.id),
  };
  const { urlsJson: _urlsJson, ...rest } = detail;

  res.json(rest);
});

/**
 * GET /api/mails/:mailId/attachments/:fileId - mở xem / tải file đính kèm.
 * - Mặc định Content-Disposition: inline (mở xem trực tiếp trong tab mới).
 * - Thêm ?download=1 để tải về máy (Content-Disposition: attachment).
 * - MIME tự nhận diện theo đuôi file (ưu tiên hơn contentType từ mail gốc).
 */
mailsRouter.get('/:mailId/attachments/:fileId', (req, res) => {
  // Chỉ chấp nhận id hợp lệ (UUID sinh bởi server) - chống mọi dạng path traversal
  const { mailId, fileId } = req.params;
  if (!/^[0-9a-f-]{8,64}$/i.test(fileId) || !/^[0-9a-f-]{8,64}$/i.test(mailId)) {
    return res.status(404).json({ error: 'File không tồn tại' });
  }

  if (!getMessage(mailId)) {
    return res.status(404).json({ error: 'Mail không tồn tại' });
  }
  const file = getAttachmentData(mailId, fileId);
  if (!file) return res.status(404).json({ error: 'File không tồn tại' });

  const fileName = file.meta.fileName || 'file';
  // 1) MIME type theo đuôi file, fallback về contentType cũ rồi mới đến mặc định
  const mime = mimeByExt(fileName) || file.meta.contentType || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  // 2) inline = mở xem trực tiếp; ?download=1 = tải về máy
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  // 3) Tên file: bản ASCII an toàn + bản UTF-8 mã hóa RFC 5987 (hỗ trợ tiếng Việt)
  const ascii = fileName.replace(/[^\w.\- ]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(/'/g, '%27');
  res.setHeader('Content-Disposition', `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Length', file.data.length);
  res.send(file.data);
});

/** PATCH /api/mails/:id  body: { read?: boolean, favorite?: boolean } */
mailsRouter.patch('/:id', (req, res) => {
  const message = getMessage(req.params.id);
  if (!message) return res.status(404).json({ error: 'Mail không tồn tại' });

  const { read, favorite } = req.body ?? {};
  if (typeof read === 'boolean') setMessageRead(message.id, read);
  if (typeof favorite === 'boolean') setMessageFavorite(message.id, favorite);

  bus.emit('mail-updated', { id: message.id });
  res.json(getMessage(message.id));
});

/** DELETE /api/mails/:id - xóa 1 mail. */
mailsRouter.delete('/:id', (req, res) => {
  const ok = deleteMessage(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Mail không tồn tại' });

  bus.emit('mail-deleted', { id: req.params.id });
  res.json({ ok: true });
});

/** DELETE /api/mails - xóa TOÀN BỘ mail (làm sạch hòm thư). */
mailsRouter.delete('/', (req, res) => {
  const removed = clearAllMessages();
  bus.emit('mails-cleared');
  res.json({ ok: true, removed });
});