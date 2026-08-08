#!/usr/bin/env node
/* ==========================================================
   CAPTCHA DISCORD BRIDGE
   - Kết nối server, bắt map captcha -> render PNG
   - Lưu vào captcha_dumps/ + gửi ảnh lên Discord
   - Nhận code: gõ `!submit <mã>` trong Discord HOẶC
     ghi vào captcha_submit.txt (web dashboard ghi vào)
   - Gửi lệnh /captcha vào game
   Cấu hình trong config.json
   ========================================================== */
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const mcprotocol = require('minecraft-protocol');
const { PNG } = require('pngjs');
const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const SUBMIT_FILE = path.join(__dirname, 'captcha_submit.txt');
const DUMP_DIR = path.join(__dirname, '..', 'captcha_dumps');

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const now = () => new Date().toLocaleTimeString();

if (!fs.existsSync(DUMP_DIR)) fs.mkdirSync(DUMP_DIR);

let bot = null;
let dc = null;
let reconnectTimer = null;
let isReconnecting = false;
let verifiedReconnect = false;
let lastSentAt = 0;

/* ---------------- DISCORD ---------------- */
async function setupDiscord() {
  if (!config.discord_token || !config.discord_channel_id) {
    console.log(`[DISCORD][${now()}] Bỏ qua: thiếu discord_token / discord_channel_id trong config.json`);
    return;
  }
  dc = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  dc.on('ready', () => console.log(`[DISCORD][${now()}] Kết nối Discord OK: ${dc.user.tag}`));

  dc.on('messageCreate', (msg) => {
    if (msg.author.bot) return;
    const prefix = config.discord_prefix || '!submit';
    if (msg.content.startsWith(prefix + ' ')) {
      const code = msg.content.slice(prefix.length).trim();
      submitCode(code, `Discord (${msg.author.tag})`);
    }
  });

  try {
    await dc.login(config.discord_token);
  } catch (e) {
    console.error(`[DISCORD][${now()}] Lỗi login Discord: ${e.message}`);
  }
}

async function sendToDiscord(imageBuffer, mapId) {
  if (!dc || !dc.isReady()) return;
  try {
    const channel = await dc.channels.fetch(config.discord_channel_id);
    if (!channel || !channel.isTextBased()) {
      console.error(`[DISCORD][${now()}] Không tìm thấy channel ${config.discord_channel_id}`);
      return;
    }
    const attachment = new AttachmentBuilder(imageBuffer, { name: `captcha_${mapId}.png` });
    await channel.send({
      content: `🧩 **CAPTCHA MAP** (acc: **${config.username}**, ID: ${mapId}) — xem ảnh và gõ: \`${config.discord_prefix || '!submit'} <mã>\``,
      files: [attachment],
    });
    console.log(`[DISCORD][${now()}] Đã gửi ảnh captcha lên Discord ✅`);
  } catch (e) {
    console.error(`[DISCORD][${now()}] Lỗi gửi Discord: ${e.message}`);
  }
}

/* ---------------- SUBMIT CODE ---------------- */
function submitCode(code, source) {
  if (!bot || !bot.connected) {
    console.log(`[SUBMIT][${now()}] Bot chưa kết nối, bỏ qua mã từ ${source}`);
    return;
  }
  const cmd = (config.captcha_command || '/captcha {code}').replace('{code}', code);
  bot.chat(cmd);
  console.log(`[SUBMIT][${now()}] (${source}) Đã gửi lệnh: ${cmd}`);
}

// Poll captcha_submit.txt (web dashboard ghi vào)
function watchSubmitFile() {
  setInterval(() => {
    try {
      if (!fs.existsSync(SUBMIT_FILE)) return;
      const content = fs.readFileSync(SUBMIT_FILE, 'utf8');
      if (!content.trim()) return;
      const lines = content.trim().split('\n');
      fs.writeFileSync(SUBMIT_FILE, '');
      for (const line of lines) {
        const parts = line.split('|');
        if (parts.length >= 2) submitCode(parts.slice(1).join('|'), 'Web Dashboard');
      }
    } catch (e) { /* bận thì bỏ qua */ }
  }, 1000);
}

/* ---------------- MINEFLAYER ---------------- */
function startWorkflow(delayMs = 1500) {
  console.log(`\n[*][${now()}] Đang Ping Server ${config.server}...`);
  mcprotocol.ping({ host: config.server, port: config.port || 25565, version: config.version || '1.20.1' }, (err, result) => {
    if (!err && result) {
      const online = result.players ? result.players.online : '?';
      console.log(`[✓][${now()}] Ping OK! Online: ${online}`);
    }
    setTimeout(() => createBot(), delayMs);
  });
}

function createBot() {
  console.log(`[*][${now()}] Đang kết nối ${config.server} với tài khoản '${config.username}'...`);
  bot = mineflayer.createBot({
    host: config.server,
    port: config.port || 25565,
    username: config.username,
    version: config.version || '1.20.1',
    brand: 'vanilla',
    checkTimeoutInterval: 45000,
  });

  bot.on('login', () => console.log(`[+][${now()}] Login OK: ${bot.username}`));
  bot.on('spawn', () => console.log(`[+][${now()}] Spawn vào world! (chờ captcha...)`));

  // BẮT CAPTCHA MAP -> RENDER PNG -> GỬI DISCORD
  bot._client.on('map', (packet) => {
    if (!packet.data) return;
    const mapId = packet.itemDamage !== undefined ? packet.itemDamage : packet.mapId;
    console.log(`\n[!][${now()}] BẮT ĐƯỢC CAPTCHA MAP (ID: ${mapId}) -> Đang render...`);

    const width = 128, height = 128;
    const png = new PNG({ width, height });
    for (let i = 0; i < packet.data.length; i++) {
      const c = packet.data[i];
      const idx = i * 4;
      png.data[idx] = c; png.data[idx + 1] = c; png.data[idx + 2] = c; png.data[idx + 3] = 255;
    }

    const fileName = `${config.username}_map_dump_${Date.now()}.png`;
    const filePath = path.join(DUMP_DIR, fileName);
    png.pack()
      .pipe(fs.createWriteStream(filePath))
      .on('finish', () => {
        console.log(`[✓][${now()}] Đã lưu: captcha_dumps/${fileName}`);
        sendToDiscord(fs.readFileSync(filePath), mapId);
      });
  });

  bot.on('messagestr', (message) => {
    const cleaned = message.replace(/\n+/g, ' ').trim();
    if (cleaned.length > 0) console.log(`[CHAT][${now()}] ${cleaned}`);
    if (cleaned.includes('vượt qua xác minh') || cleaned.includes('reconnect')) {
      console.log(`[⚡][${now()}] Đã vượt qua xác minh! Reconnect sau 4.0s...`);
      verifiedReconnect = true;
      bot.quit();
    }
  });

  bot.on('kicked', (reason) => console.log(`[!][${now()}] Bị kick: ${JSON.stringify(reason)}`));
  bot.on('error', (err) => console.error(`[LỖI][${now()}]:`, err.message || err));

  bot.on('end', (reason) => {
    if (isReconnecting) return;
    isReconnecting = true;
    const delay = verifiedReconnect ? 4000 : 8000;
    console.log(`[-][${now()}] Ngắt kết nối (${reason}). Reconnect sau ${delay / 1000}s...`);
    verifiedReconnect = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      isReconnecting = false;
      startWorkflow(1000);
    }, delay);
  });
}

/* ---------------- MAIN ---------------- */
console.log('==========================================');
console.log('  CAPTCHA DISCORD BRIDGE');
console.log('==========================================');
setupDiscord();
watchSubmitFile();
startWorkflow();
