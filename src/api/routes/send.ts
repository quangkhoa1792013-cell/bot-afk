/**
 * API routes: gửi mail + cấu hình (SMTP outbound, Telegram).
 */
import { Router } from 'express';
import { sendMail, testSmtpConnection, getActiveSmtpSettings, saveSmtpSettings } from '../../mailer/send.service';
import { getActiveTelegramSettings, saveTelegramSettings } from '../../notifications/telegram';
import { listSentMails, deleteSentMail } from '../../db/mail.repository';

export const sendRouter = Router();

/** POST /api/send - soạn & gửi email qua SMTP provider đã cấu hình. */
sendRouter.post('/send', async (req, res) => {
  const { to, subject, text, html } = req.body ?? {};

  if (typeof to !== 'string' || !to.trim() || !/^\S+@\S+\.\S+$/.test(to.trim())) {
    return res.status(400).json({ error: 'Địa chỉ người nhận không hợp lệ' });
  }

  try {
    await sendMail({
      to: to.trim(),
      subject: typeof subject === 'string' ? subject : '',
      text: typeof text === 'string' ? text : '',
      html: typeof html === 'string' ? html : null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/** POST /api/send/test - kiểm tra kết nối SMTP. */
sendRouter.post('/send/test', async (_req, res) => {
  const result = await testSmtpConnection();
  res.json(result);
});

/** GET /api/sent - hộp "đã gửi". */
sendRouter.get('/sent', (_req, res) => {
  res.json({ messages: listSentMails() });
});

/** DELETE /api/sent/:id - xóa 1 mail đã gửi. */
sendRouter.delete('/sent/:id', (req, res) => {
  const ok = deleteSentMail(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Bản ghi không tồn tại' });
  res.json({ ok: true });
});

/** GET /api/settings - trả cấu hình hiện tại (che mật khẩu). */
sendRouter.get('/settings', (_req, res) => {
  const smtp = getActiveSmtpSettings();
  const telegram = getActiveTelegramSettings();
  res.json({
    smtp: { ...smtp, pass: smtp.pass ? '••••••' : '' },
    telegram: {
      ...(telegram ?? { botToken: '', chatId: '' }),
      botToken: telegram?.botToken ? telegram.botToken.slice(0, 6) + '•••' : '',
    },
  });
});

/** PUT /api/settings/smtp - lưu cấu hình SMTP outbound. */
sendRouter.put('/settings/smtp', (req, res) => {
  const s = req.body ?? {};
  const current = getActiveSmtpSettings();

  saveSmtpSettings({
    host: String(s.host ?? '').trim(),
    port: Number(s.port ?? 587),
    secure: Boolean(s.secure),
    user: String(s.user ?? '').trim(),
    // Không đổi pass nếu UI gửi lại dạng che '••••••'
    pass: s.pass && String(s.pass).startsWith('•') ? current.pass : String(s.pass ?? ''),
    fromName: String(s.fromName ?? '').trim(),
  });
  res.json({ ok: true });
});

/** PUT /api/settings/telegram - lưu cấu hình Telegram. */
sendRouter.put('/settings/telegram', (req, res) => {
  const t = req.body ?? {};
  saveTelegramSettings({
    botToken: String(t.botToken ?? '').trim(),
    chatId: String(t.chatId ?? '').trim(),
  });
  res.json({ ok: true });
});