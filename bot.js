const mineflayer = require('mineflayer');
const mcprotocol = require('minecraft-protocol');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const outputDir = path.join(__dirname, 'captcha_dumps');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

let bot = null;
let reconnectTimer = null;
let isReconnecting = false;
let verifiedReconnect = false;

function cleanText(reason) {
  if (!reason) return 'Không có lý do.';
  if (typeof reason === 'string') {
    try { reason = JSON.parse(reason); } catch (e) { return reason; }
  }
  let text = '';
  function extract(obj) {
    if (!obj) return;
    if (typeof obj === 'string') { text += obj; return; }
    if (obj.text) text += obj.text;
    if (obj.extra && Array.isArray(obj.extra)) obj.extra.forEach(extract);
    else if (obj.value) {
      if (typeof obj.value === 'string') text += obj.value;
      else if (Array.isArray(obj.value)) obj.value.forEach(extract);
      else if (typeof obj.value === 'object') extract(obj.value);
    }
  }
  extract(reason);
  return text.replace(/\n+/g, ' | ').trim() || JSON.stringify(reason);
}

function startBotWorkflow(delayMs = 1500) {
  const now = () => new Date().toLocaleTimeString();
  
  console.log(`\n[*][${now()}] Đang Ping Server AquaMC...`);
  
  mcprotocol.ping({ host: 'aquamc.vn', port: 25565, version: "1.20.1" }, (err, result) => {
    if (!err && result) {
      const online = result.players ? result.players.online : '?';
      console.log(`[✓][${now()}] Ping thành công! Latency: ${result.latency || 0}ms | Online: ${online}`);
    }

    console.log(`[*][${now()}] Chờ ${delayMs / 1000}s trước khi gửi Handshake...`);
    setTimeout(() => {
      createBot();
    }, delayMs);
  });
}

function createBot() {
  const now = () => new Date().toLocaleTimeString();
  console.log(`[*][${now()}] Đang khởi tạo kết nối Bot...`);

  bot = mineflayer.createBot({
    host: 'aquamc.vn',
    port: 25565,
    username: 'Sonar',
    version: "1.20.1",
    brand: 'vanilla',
    checkTimeoutInterval: 45000
  });

  bot.on('login', () => {
    console.log(`[+][${now()}] Login thành công! Tên bot: ${bot.username}`);
  });

  bot.on('spawn', () => {
    console.log(`[+][${now()}] Đã Spawn vào World!`);
  });

  // BẮT CAPTCHA MAP
  bot._client.on('map', (packet) => {
    if (!packet.data) return;

    const mapId = packet.itemDamage !== undefined ? packet.itemDamage : packet.mapId;
    console.log(`\n[!][${now()}] BẮT ĐƯỢC CAPTCHA MAP (ID: ${mapId}) -> Đang render ảnh...`);

    const width = 128;
    const height = 128;
    const png = new PNG({ width, height });

    for (let i = 0; i < packet.data.length; i++) {
      const colorByte = packet.data[i];
      const idx = i * 4;

      png.data[idx] = colorByte;     // R
      png.data[idx + 1] = colorByte; // G
      png.data[idx + 2] = colorByte; // B
      png.data[idx + 3] = 255;       // Alpha
    }

    const fileName = `map_dump_${Date.now()}.png`;
    const filePath = path.join(outputDir, fileName);

    png.pack()
      .pipe(fs.createWriteStream(filePath))
      .on('finish', () => {
        console.log(`[✓][${now()}] LƯU THÀNH CÔNG CAPTCHA: captcha_dumps/${fileName}\n`);
      });
  });

  // XỬ LÝ CHAT & CHỦ ĐỘNG DISCONNECT
  bot.on('messagestr', (message) => {
    const cleaned = message.replace(/\n+/g, ' ').trim();
    if (cleaned.length > 0) {
      console.log(`[CHAT][${now()}] ${cleaned}`);
    }

    if (cleaned.includes('vượt qua xác minh') || cleaned.includes('reconnect')) {
      console.log(`[⚡][${now()}] Đã vượt qua xác minh! Chủ động quit và Reconnect sau 4.0s...`);
      verifiedReconnect = true;
      
      // Chủ động ngắt kết nối thay vì chờ bị Kick
      bot.quit();
    }
  });

  bot.on('kicked', (reason) => {
    console.log(`[!][${now()}] LÝ DO BỊ KICK: ${cleanText(reason)}`);
  });

  bot.on('error', (err) => console.error(`[LỖI][${now()}]:`, err.message || err));

  bot.on('end', (reason) => {
    if (isReconnecting) return;
    isReconnecting = true;

    // Nếu vừa xác minh thành công -> Chờ đúng 4.0 giây (Timing vàng để bypass Cooldown & giữ Session)
    // Nếu bị kick lỗi khác -> Chờ 8.0 giây
    const delay = verifiedReconnect ? 4000 : 8000;
    const modeText = verifiedReconnect ? 'RECONNECT XÁC MINH (4.0s)' : 'Nghỉ 8.0s';

    console.log(`[-][${now()}] Ngắt kết nối (${reason}). [${modeText}]...`);
    
    verifiedReconnect = false;

    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      isReconnecting = false;
      startBotWorkflow(1000); // Ping + Handshake sau 1s
    }, delay); 
  });
}

// Khởi chạy quy trình
startBotWorkflow();
