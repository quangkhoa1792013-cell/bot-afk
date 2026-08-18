/**
 * Express app: API JSON + phục vụ web dashboard đã build (web/dist từ Vite).
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { WEB_HOST, WEB_PORT, ROOT_DIR } from '../config';
import { mailsRouter } from './routes/mails';
import { sendRouter } from './routes/send';
import { eventsRouter } from './routes/events';
import { mailboxesRouter } from './routes/mailboxes';
import { MAIL_DOMAIN, CATCH_ALL, SMTP_PORT } from '../config';

export function createApp(): express.Express {
  const app = express();

  app.use(express.json({ limit: '30mb' }));
  app.use((req, _res, next) => {
    console.log(`[api] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
  });

  // Health check (dùng cho uptime monitoring)
  app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

  // Thông tin chung cho frontend (domain, chế độ nhận mail)
  app.get('/api/meta', (_req, res) => {
    res.json({
      domain: MAIL_DOMAIN,
      catchAll: CATCH_ALL,
      smtpPort: SMTP_PORT,
    });
  });

  app.use('/api/mails', mailsRouter);
  app.use('/api/mailboxes', mailboxesRouter);
  app.use('/api', sendRouter);
  app.use('/api', eventsRouter);

  // Dashboard tĩnh: web/dist (sản phẩm của `npm run build`)
  const webDist = path.join(ROOT_DIR, 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
  } else {
    // Chưa build web -> nhắc nhở
    console.warn('[web] Chưa tìm thấy web/dist — chạy `npm run build` trước, hoặc dùng `npm run dev` (UI ở :5173).');
  }

  // API không tồn tại -> 404 JSON
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API không tồn tại' }));

  return app;
}

export function startWebServer(): Promise<ReturnType<express.Express['listen']>> {
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = app.listen(WEB_PORT, WEB_HOST, () => {
      console.log(`[web] Dashboard & API: http://${WEB_HOST}:${WEB_PORT}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}