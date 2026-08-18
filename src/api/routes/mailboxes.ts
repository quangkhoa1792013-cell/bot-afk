/**
 * API routes: quản lý địa chỉ hòm thư (mailboxes).
 *  - GET    /api/mailboxes          danh sách
 *  - POST   /api/mailboxes          tạo mới {name, note}
 *  - PATCH  /api/mailboxes/:id      sửa {name?, note?}
 *  - DELETE /api/mailboxes/:id      xóa
 */
import { Router } from 'express';
import {
  listMailboxes, createMailbox, updateMailbox, deleteMailbox,
} from '../../db/mail.repository';
import { MAIL_DOMAIN } from '../../config';

export const mailboxesRouter = Router();

/** Tên hợp lệ: chữ thường + số + . - _ (phần trước @). */
function isValidName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(name);
}

/** GET /api/mailboxes */
mailboxesRouter.get('/', (_req, res) => {
  res.json({ domain: MAIL_DOMAIN, mailboxes: listMailboxes(MAIL_DOMAIN) });
});

/** POST /api/mailboxes  body: { name, note? } */
mailboxesRouter.post('/', (req, res) => {
  const { name, note } = req.body ?? {};
  if (typeof name !== 'string' || !isValidName(name.toLowerCase())) {
    return res.status(400).json({ error: 'Tên không hợp lệ. Chỉ dùng chữ thường, số, dấu . - _ (vd: github01)' });
  }

  try {
    const created = createMailbox(name.toLowerCase(), typeof note === 'string' ? note.trim() : '');
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof Error && err.message === 'EXISTS') {
      return res.status(409).json({ error: `Địa chỉ ${name.toLowerCase()}@${MAIL_DOMAIN} đã tồn tại` });
    }
    throw err;
  }
});

/** PATCH /api/mailboxes/:id  body: { name?, note? } */
mailboxesRouter.patch('/:id', (req, res) => {
  const { name, note } = req.body ?? {};

  if (name !== undefined && (typeof name !== 'string' || !isValidName(name.toLowerCase()))) {
    return res.status(400).json({ error: 'Tên không hợp lệ. Chỉ dùng chữ thường, số, dấu . - _' });
  }

  try {
    updateMailbox(req.params.id, {
      ...(typeof name === 'string' ? { name: name.toLowerCase() } : {}),
      ...(typeof note === 'string' ? { note: note.trim() } : {}),
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Địa chỉ không tồn tại' });
    }
    if (err instanceof Error && err.message === 'EXISTS') {
      return res.status(409).json({ error: `Địa chỉ ${String(name ?? '').toLowerCase()}@${MAIL_DOMAIN} đã tồn tại` });
    }
    throw err;
  }
});

/** DELETE /api/mailboxes/:id */
mailboxesRouter.delete('/:id', (req, res) => {
  const ok = deleteMailbox(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Địa chỉ không tồn tại' });
  res.json({ ok: true });
});