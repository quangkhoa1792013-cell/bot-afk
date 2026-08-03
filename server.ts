import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { mccManager } from './src/server/mccManager.js';
import {
  getCurrentCaptchaPngBuffer,
  generateSampleCaptchaPngBuffer,
  renderMapPaletteToPngBuffer,
  updateCurrentCaptchaPngBuffer,
} from './src/server/mapRenderer.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // REST endpoints for MCC INI
  app.get('/api/mcc/ini', async (req, res) => {
    const content = await mccManager.getIniContent();
    res.json({ success: true, content });
  });

  app.post('/api/mcc/ini', async (req, res) => {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'Content must be string' });
    }
    const success = await mccManager.saveIniContent(content);
    res.json({ success });
  });

  // Anti-Kick Silent Mode Endpoint
  app.post('/api/mcc/silent-mode', async (req, res) => {
    const success = await mccManager.enableSilentMode();
    res.json({ success, message: 'Chế độ Im Lặng Anti-Kick đã được kích hoạt!' });
  });

  // Map Captcha PNG Image Endpoint (Serves /captcha.png and /api/captcha-image)
  const serveCaptchaImage = (req: express.Request, res: express.Response) => {
    const pngBuf = getCurrentCaptchaPngBuffer();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(pngBuf);
  };

  app.get('/captcha.png', serveCaptchaImage);
  app.get('/api/captcha-image', serveCaptchaImage);

  // Endpoint to generate or update Map Captcha image
  app.post('/api/captcha-image', (req, res) => {
    const { code, colors } = req.body;
    if (Array.isArray(colors)) {
      const buf = renderMapPaletteToPngBuffer(colors);
      updateCurrentCaptchaPngBuffer(buf);
      return res.json({ success: true, message: 'Đã render mảng màu Map Packet sang PNG thành công!' });
    }
    if (code && typeof code === 'string') {
      generateSampleCaptchaPngBuffer(code);
      return res.json({ success: true, message: `Đã cập nhật mã Map Captcha: ${code}` });
    }
    res.status(400).json({ success: false, error: 'Missing code or colors parameter' });
  });

  // API to fetch free public SOCKS5 proxies
  app.get('/api/proxies', async (req, res) => {
    try {
      const response = await fetch(
        'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=3000&country=all&ssl=all&anonymity=all',
        { signal: AbortSignal.timeout(5000) }
      );
      if (response.ok) {
        const text = await response.text();
        const proxies = text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.includes(':'))
          .slice(0, 20)
          .map((str) => {
            const [host, portStr] = str.split(':');
            return { host, port: parseInt(portStr, 10) || 1080 };
          });
        if (proxies.length > 0) {
          return res.json({ success: true, proxies });
        }
      }
    } catch (err) {
      // Fallback
    }

    return res.json({
      success: true,
      proxies: [
        { host: '184.178.172.5', port: 1080, country: 'US' },
        { host: '192.252.214.20', port: 15864, country: 'US' },
        { host: '192.241.110.101', port: 1080, country: 'US' },
        { host: '98.162.25.7', port: 4145, country: 'US' },
        { host: '72.210.252.134', port: 46164, country: 'US' },
      ],
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    mccManager.addClient(ws);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        mccManager.handleClientMessage(ws, msg);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

