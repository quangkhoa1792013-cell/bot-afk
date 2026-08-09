'use strict';

const mineflayer = require('mineflayer');
const fs = require('fs');
const path = require('path');

const { createMapBuffer, applyMapPacket, filledPixelCount } = require('./map_assembler');
const { renderBufferToPNG } = require('./render');

const dumpsDir = path.join(__dirname, 'dumps');
if (!fs.existsSync(dumpsDir)) fs.mkdirSync(dumpsDir);

const HOST = 'aquamc.vn';
const PORT = 25565;
const VERSION = '1.20.1';
const USERNAME = process.env.CAPTCHA_BOT_USERNAME || process.argv[2] || 'Sonar';

const now = () => new Date().toLocaleTimeString();
const maps = new Map(); // mapId -> { buffer, packetCount, firstSeen }

let bot = null;
let reconnectTimer = null;
let isReconnecting = false;

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

  bot.on('login', () => console.log(`[+][${now()}] Logged in as ${bot.username}`));
  bot.on('spawn', () => console.log(`[+][${now()}] Spawned in world`));

  bot._client.on('map', handleMapPacket);

  bot.on('messagestr', (message) => {
    const cleaned = message.replace(/\n+/g, ' ').trim();
    if (cleaned.length > 0) console.log(`[CHAT][${now()}] ${cleaned}`);
    if (cleaned.includes('vượt qua xác minh') || cleaned.includes('reconnect')) {
      bot.quit();
    }
  });

  bot.on('kicked', (reason) => console.log(`[!][${now()}] Kicked: ${reason}`));
  bot.on('error', (err) => console.error(`[ERR][${now()}]`, err.message || err));

  bot.on('end', () => {
    if (isReconnecting) return;
    isReconnecting = true;
    console.log(`[-][${now()}] Disconnected. Reconnecting in 8s...`);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      isReconnecting = false;
      createBot();
    }, 8000);
  });
}

createBot();
