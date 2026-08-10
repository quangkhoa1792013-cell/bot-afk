'use strict';

const mineflayer = require('mineflayer');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const { createMapBuffer, applyMapPacket, filledPixelCount } = require('./map_assembler');
const { renderBufferToPNG } = require('./render');

const dumpsDir = path.join(__dirname, 'dumps');
if (!fs.existsSync(dumpsDir)) fs.mkdirSync(dumpsDir);

const HOST = process.env.CAPTCHA_BOT_HOST || 'aquamc.vn';
const PORT = Number(process.env.CAPTCHA_BOT_PORT || 25565);
const VERSION = process.env.CAPTCHA_BOT_VERSION || '1.20.1';
const USERNAME = process.env.CAPTCHA_BOT_USERNAME || process.argv[2] || 'Sonar';

const now = () => new Date().toLocaleTimeString();
const maps = new Map(); // mapId -> { buffer, packetCount, firstSeen }

let bot = null;
let reconnectTimer = null;
let isReconnecting = false;
let consecutiveFails = 0;
let cooldownUntil = 0;
let lastMapAt = 0;
const RECONNECT_BASE_MS = 30000;
const RECONNECT_STEP_MS = 5000;
const RECONNECT_MAX_MS = 60000;
const BLOCK_COOLDOWN_MS = 5 * 60 * 1000; // "bị chặn truy cập" -> nghỉ 5 phút
const FAIL_COOLDOWN_MS = 3 * 60 * 1000;  // "Xác minh thất bại" -> nghỉ 3 phút

function nextReconnectDelayMs() {
  const backoff = Math.min(RECONNECT_BASE_MS + consecutiveFails * RECONNECT_STEP_MS, RECONNECT_MAX_MS);
  return Math.max(backoff, cooldownUntil - Date.now());
}

function cleanText(reason) {
  if (!reason) return '';
  if (typeof reason !== 'string') {
    try { reason = JSON.stringify(reason); } catch (e) { return String(reason); }
  }
  try { reason = JSON.parse(reason); } catch (e) { /* not json */ }
  let text = '';
  function extract(obj) {
    if (!obj) return;
    if (typeof obj === 'string') { text += obj; return; }
    if (obj.text) text += obj.text;
    if (Array.isArray(obj.extra)) obj.extra.forEach(extract);
  }
  extract(reason);
  return text.replace(/\n+/g, ' ').trim();
}

function saveDump(mapId, map) {
  const ts = Date.now();
  const png = renderBufferToPNG(map.buffer);
  const fileName = `map_${mapId}_${ts}.png`;
  const filePath = path.join(dumpsDir, fileName);
  png.pack().pipe(fs.createWriteStream(filePath)).on('finish', () => {
    console.log(`[✓][${now()}] Saved ${fileName} (${map.packetCount} packets, ${filledPixelCount(map.buffer)}/16384 px)`);
  });

  const meta = {
    mapId,
    scale: map.scale,
    locked: map.locked,
    timestamp: ts,
    packetCount: map.packetCount,
    filledPixels: filledPixelCount(map.buffer),
    iconCount: map.iconCount
  };
  fs.writeFileSync(path.join(dumpsDir, `${fileName}.json`), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dumpsDir, 'latest.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(dumpsDir, 'latest.png'), PNG.sync.write(png));
}

function handleMapPacket(packet) {
  const mapId = packet.itemDamage !== undefined ? packet.itemDamage : packet.mapId;
  let map = maps.get(mapId);
  if (!map) {
    map = { buffer: createMapBuffer(), packetCount: 0, scale: packet.scale, locked: packet.locked, iconCount: 0 };
    maps.set(mapId, map);
  }
  map.scale = packet.scale;
  map.locked = packet.locked;
  map.iconCount = packet.icons ? packet.icons.length : 0;
  map.packetCount++;

  const changed = applyMapPacket(map.buffer, packet);
  const filled = filledPixelCount(map.buffer);
  const cols = packet.columns || 0;

  if (packet.columns > 0) {
    console.log(`[!][${now()}] map packet id=${mapId} patch=${cols}x${packet.rows}@(${packet.x},${packet.y}) data=${packet.data.length}B filled=${filled}/16384`);
  }
  if (changed) {
    saveDump(mapId, map);
  }
}

function createBot() {
  console.log(`[*][${now()}] Connecting ${USERNAME} -> ${HOST}:${PORT} (${VERSION})...`);
  bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    version: VERSION,
    brand: 'vanilla',
    checkTimeoutInterval: 45000
  });

  bot.on('login', () => {
    consecutiveFails = 0;
    lastMapAt = 0;
    console.log(`[+][${now()}] Logged in as ${bot.username}`);
  });
  bot.on('spawn', () => {
    console.log(`[+][${now()}] Spawned in world`);
    setTimeout(() => {
      if (lastMapAt === 0 && bot && bot.username) {
        console.log(`[!][${now()}] WARNING: no map packet received within 5s of spawn - captcha map may not be sent to this client`);
      }
    }, 5000);
  });

  bot._client.on('map', (packet) => {
    lastMapAt = Date.now();
    handleMapPacket(packet);
  });

  bot.on('messagestr', (message) => {
    const cleaned = message.replace(/\n+/g, ' ').trim();
    if (cleaned.length > 0) console.log(`[CHAT][${now()}] ${cleaned}`);
  });

  bot.on('kicked', (reason) => {
    const text = cleanText(reason);
    console.log(`[!][${now()}] Kicked: ${text || reason}`);
    if (text.includes('bị chặn truy cập')) {
      cooldownUntil = Date.now() + BLOCK_COOLDOWN_MS;
      console.log(`[⛔][${now()}] IP/account blocked. Pausing ${BLOCK_COOLDOWN_MS / 60000} min...`);
    } else if (text.includes('Xác minh thất bại') || text.includes('xác minh thất bại')) {
      cooldownUntil = Date.now() + FAIL_COOLDOWN_MS;
      console.log(`[!][${now()}] Verification failed. Pausing ${FAIL_COOLDOWN_MS / 60000} min...`);
    }
  });
  bot.on('error', (err) => console.error(`[ERR][${now()}]`, err.message || err));

  bot.on('end', () => {
    if (isReconnecting) return;
    isReconnecting = true;
    const delayMs = nextReconnectDelayMs();
    consecutiveFails++;
    console.log(`[-][${now()}] Disconnected. Reconnecting in ${delayMs / 1000}s (fail #${consecutiveFails})...`);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      isReconnecting = false;
      createBot();
    }, delayMs);
  });
}

createBot();
