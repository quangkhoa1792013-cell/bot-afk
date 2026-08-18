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
  listMessages, countMessagesForEmail, countUnreadForEmail,
} from '../../db/mail.repository';
import { bus } from '../../events/bus';

export const profilesRouter = Router();

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
