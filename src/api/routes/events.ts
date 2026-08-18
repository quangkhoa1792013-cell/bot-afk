/**
 * SSE (Server-Sent Events):
 * Dashboard kết nối vào GET /api/events và nhận đẩy realtime khi:
 *  - new-mail: mail mới về (kèm payload đầy đủ + profileIds khớp assigned_email)
 *  - mail-updated / mail-deleted / mails-cleared
 *  - profiles-changed: danh sách Profile thay đổi
 */
import { Router, type Request, type Response } from 'express';
import { getMessage } from '../../db/mail.repository';
import { findProfilesByEmail } from '../../profiles/profile.repository';
import { bus } from '../../events/bus';

export const eventsRouter = Router();

/** Trả về SSE event - giữ kết nối mở vô thời hạn. */
eventsRouter.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Ping định kỳ giữ kết nối sống (proxy/load balancer hay đóng idle connection)
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const onNewMail = ({ id }: { id: string }): void => {
    const message = getMessage(id);
    if (!message) return;
    // Profile nào có assigned_email trùng với địa chỉ nhận của mail này?
    const profileIds = findProfilesByEmail(message.toAddr).map((p) => p.id);
    send('new-mail', { message, profileIds });
  };
  const onUpdated = ({ id }: { id: string }): void => send('mail-updated', { id });
  const onDeleted = ({ id }: { id: string }): void => send('mail-deleted', { id });
  const onCleared = (): void => send('mails-cleared', {});
  const onProfilesChanged = (): void => send('profiles-changed', {});

  bus.on('new-mail', onNewMail);
  bus.on('mail-updated', onUpdated);
  bus.on('mail-deleted', onDeleted);
  bus.on('mails-cleared', onCleared);
  bus.on('profiles-changed', onProfilesChanged);

  // Dọn dẹp khi client ngắt kết nối
  req.on('close', () => {
    clearInterval(ping);
    bus.removeListener('new-mail', onNewMail);
    bus.removeListener('mail-updated', onUpdated);
    bus.removeListener('mail-deleted', onDeleted);
    bus.removeListener('mails-cleared', onCleared);
    bus.removeListener('profiles-changed', onProfilesChanged);
  });
});