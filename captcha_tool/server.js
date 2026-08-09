'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.CAPTCHA_WEB_PORT || process.argv[2] || 8080);
const dumpsDir = path.join(__dirname, 'dumps');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  if (urlPath === '/' || urlPath === '/index.html') {
    sendFile(res, path.join(__dirname, 'index.html'));
  } else if (urlPath === '/latest.png') {
    sendFile(res, path.join(dumpsDir, 'latest.png'));
  } else if (urlPath === '/latest.json') {
    sendFile(res, path.join(dumpsDir, 'latest.json'));
  } else if (urlPath === '/dumps') {
    fs.readdir(dumpsDir, (err, files) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'no dumps' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(files.filter((f) => f.endsWith('.png'))));
    });
  } else if (urlPath.startsWith('/dumps/')) {
    const name = path.basename(urlPath);
    sendFile(res, path.join(dumpsDir, name));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`Web viewer: http://localhost:${PORT} (pixelated rendering)`));
