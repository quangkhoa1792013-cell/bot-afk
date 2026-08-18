/**
 * API routes: Quản lý Profile tập trung (Web-in-Web).
 *  - GET    /api/profiles            danh sách (kèm unreadCount/mailCount)
 *  - POST   /api/profiles            tạo {name, assignedEmail, targetUrl?, notes?, status?}
 *  - PATCH  /api/profiles/:id        sửa (mọi field đều optional)
 *  - DELETE /api/profiles/:id        xóa
 *  - GET    /api/profiles/:id/mails  mail nhận tới assigned_email của profile
 */
import { Router } from 'express';
import {
  listProfiles, getProfile, createProfile, updateProfile, deleteProfile,
} from '../../profiles/profile.repository';
import {
  listMessages, countMessagesForEmail, countUnreadForEmail, createMailbox,
} from '../../db/mail.repository';
import { bus } from '../../events/bus';

export const profilesRouter = Router();

/** Tên mailbox hợp lệ (chuẩn địa chỉ hòm thư: chữ thường, số, . _ -). */
const MAILBOX_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * Tự động tạo hòm thư cho assigned_email nếu chưa tồn tại.
 * KHÔNG có bước này thì SMTP sẽ từ chối 550 mọi mail gửi tới email của Profile.
 * Trả về tên mailbox (local part), ném Error('INVALID_MAILBOX') nếu tên không hợp lệ.
 */
function ensureMailboxForEmail(assignedEmail: string): string {
  const mailboxName = assignedEmail.toLowerCase().split('@')[0];
  if (!MAILBOX_NAME_RE.test(mailboxName)) {
    throw new Error('INVALID_MAILBOX');
  }
  try {
    createMailbox(mailboxName, `Hòm thư tự động tạo cho Profile`);
  } catch (err) {
    if (!(err instanceof Error && err.message === 'EXISTS')) throw err;
  }
  return mailboxName;
}

/** Email hợp lệ (chuẩn thông thường). */
function isValidEmail(email: string): boolean {
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email.trim());
}

/** URL hợp lệ: chỉ http/https (để nhúng iframe bot local). */
function isValidTargetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** GET /api/profiles — kèm số mail + mail chưa đọc của từng profile. */
profilesRouter.get('/', (_req, res) => {
  const profiles = listProfiles().map((p) => ({
    ...p,
    mailCount: countMessagesForEmail(p.assignedEmail),
    unreadCount: countUnreadForEmail(p.assignedEmail),
  }));
  res.json({ profiles });
});

/** POST /api/profiles  body: { name, assignedEmail, targetUrl?, notes?, status? } */
profilesRouter.post('/', (req, res) => {
  const { name, assignedEmail, targetUrl, notes, status } = req.body ?? {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Thiếu tên Profile' });
  }
  if (typeof assignedEmail !== 'string' || !isValidEmail(assignedEmail)) {
    return res.status(400).json({ error: 'Email gán không hợp lệ (vd: bot01@khoablabla.ddns.net)' });
  }
  if (targetUrl !== undefined && targetUrl !== '' && (typeof targetUrl !== 'string' || !isValidTargetUrl(targetUrl))) {
    return res.status(400).json({ error: 'target_url phải là URL http:// hoặc https:// (vd: http://localhost:8080)' });
  }
  if (status !== undefined && status !== 'active' && status !== 'inactive') {
    return res.status(400).json({ error: 'status chỉ nhận "active" hoặc "inactive"' });
  }

  try {
    ensureMailboxForEmail(assignedEmail);
  } catch (err) {
    if (err instanceof Error && err.message === 'INVALID_MAILBOX') {
      return res.status(400).json({
        error: `Phần trước @ của email (${String(assignedEmail).split('@')[0]}) không thể dùng làm địa chỉ hòm thư. Chỉ chấp nhận chữ thường, số, dấu chấm, gạch ngang, gạch dưới.`,
      });
    }
    throw err;
  }

  try {
    const created = createProfile({
      name,
      assignedEmail,
      targetUrl: typeof targetUrl === 'string' ? targetUrl : '',
      notes: typeof notes === 'string' ? notes : '',
      status: status === 'inactive' ? 'inactive' : 'active',
    });
    bus.emit('profiles-changed');
    res.status(201).json(created);
  } catch (err) {
    if (err instanceof Error && err.message === 'EXISTS_NAME') {
      return res.status(409).json({ error: `Đã có Profile tên "${String(name).trim()}"` });
    }
    if (err instanceof Error && err.message === 'EXISTS_EMAIL') {
      return res.status(409).json({ error: `Email ${String(assignedEmail).trim()} đã được gán cho Profile khác` });
    }
    throw err;
  }
});

/** PATCH /api/profiles/:id  body: { name?, assignedEmail?, targetUrl?, notes?, status? } */
profilesRouter.patch('/:id', (req, res) => {
  const { name, assignedEmail, targetUrl, notes, status } = req.body ?? {};
  const patch: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Tên Profile không hợp lệ' });
    }
    patch.name = name;
  }
  if (assignedEmail !== undefined) {
    if (typeof assignedEmail !== 'string' || !isValidEmail(assignedEmail)) {
      return res.status(400).json({ error: 'Email gán không hợp lệ (vd: bot01@khoablabla.ddns.net)' });
    }
    patch.assignedEmail = assignedEmail;
  }
  if (targetUrl !== undefined) {
    if (targetUrl !== '' && (typeof targetUrl !== 'string' || !isValidTargetUrl(targetUrl))) {
      return res.status(400).json({ error: 'target_url phải là URL http:// hoặc https://' });
    }
    patch.targetUrl = targetUrl;
  }
  if (notes !== undefined) patch.notes = notes;
  if (status !== undefined) {
    if (status !== 'active' && status !== 'inactive') {
      return res.status(400).json({ error: 'status chỉ nhận "active" hoặc "inactive"' });
    }
    patch.status = status;
  }

  // Đổi email gán -> đảm bảo hòm thư của email mới được tạo
  if (patch.assignedEmail !== undefined) {
    try {
      ensureMailboxForEmail(String(patch.assignedEmail));
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_MAILBOX') {
        return res.status(400).json({
          error: 'Phần trước @ của email không thể dùng làm địa chỉ hòm thư (chỉ chữ thường, số, . _ -).',
        });
      }
      throw err;
    }
  }

  try {
    const updated = updateProfile(req.params.id, patch);
    bus.emit('profiles-changed');
    res.json(updated);
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Profile không tồn tại' });
    }
    if (err instanceof Error && err.message === 'EXISTS_NAME') {
      return res.status(409).json({ error: 'Đã có Profile cùng tên' });
    }
    if (err instanceof Error && err.message === 'EXISTS_EMAIL') {
      return res.status(409).json({ error: 'Email đã được gán cho Profile khác' });
    }
    throw err;
  }
});

/** DELETE /api/profiles/:id */
profilesRouter.delete('/:id', (req, res) => {
  if (!deleteProfile(req.params.id)) {
    return res.status(404).json({ error: 'Profile không tồn tại' });
  }
  bus.emit('profiles-changed');
  res.json({ ok: true });
});

/** GET /api/profiles/:id/mails?search=&limit= — mail gửi tới assigned_email của profile. */
profilesRouter.get('/:id/mails', (req, res) => {
  const profile = getProfile(req.params.id);
  if (!profile) return res.status(404).json({ error: 'Profile không tồn tại' });

  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const limit = Number(req.query.limit ?? 100);

  const messages = listMessages({
    toEmail: profile.assignedEmail,
    search,
    limit,
  });
  res.json({ messages });
});
