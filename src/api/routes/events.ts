/**
 * SSE (Server-Sent Events):
 * Dashboard kết nối vào GET /api/events và nhận đẩy realtime khi:
 *  - new-mail: mail mới về (kèm payload đầy đủ)
 *  - mail-updated / mail-deleted / mails-cleared
 */
import { Router, type Request, type Response } from 'express';
import { getMessage } from '../../db/mail.repository';
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
    // Gửi payload mail mới cho client để popup/toast ngay
    send('new-mail', { message: getMessage(id) });
  };
  const onUpdated = ({ id }: { id: string }): void => send('mail-updated', { id });
  const onDeleted = ({ id }: { id: string }): void => send('mail-deleted', { id });
  const onCleared = (): void => send('mails-cleared', {});

  bus.on('new-mail', onNewMail);
  bus.on('mail-updated', onUpdated);
  bus.on('mail-deleted', onDeleted);
  bus.on('mails-cleared', onCleared);

  // Dọn dẹp khi client ngắt kết nối
  req.on('close', () => {
    clearInterval(ping);
    bus.removeListener('new-mail', onNewMail);
    bus.removeListener('mail-updated', onUpdated);
    bus.removeListener('mail-deleted', onDeleted);
    bus.removeListener('mails-cleared', onCleared);
  });
});