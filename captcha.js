const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

const captchaDir = path.join(__dirname, 'captcha_dumps');

async function processCaptcha(filePath) {
  console.log(`\n[*] Đang phân tích file: ${path.basename(filePath)}...`);
  const startTime = Date.now();

  try {
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    });

    const cleanedText = text.replace(/[^a-zA-Z0-29]/g, '').trim();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`========================================`);
    console.log(`[✓] KẾT QUẢ CAPTCHA : "${cleanedText}"`);
    console.log(`[✓] THỜI GIAN XỬ LÝ : ${duration} giây`);
    console.log(`========================================\n`);

    return cleanedText;
  } catch (error) {
    console.error(`[!] Lỗi khi xử lý OCR:`, error.message);
    return null;
  }
}

// Nếu chạy trực tiếp file captcha.js -> Lấy file ảnh mới nhất để test
if (require.main === module) {
  if (!fs.existsSync(captchaDir)) {
    console.log('[!] Chưa có thư mục captcha_dumps/');
    process.exit(1);
  }

  const files = fs.readdirSync(captchaDir)
    .filter(f => f.endsWith('.png'))
    .map(f => ({ name: f, time: fs.statSync(path.join(captchaDir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  if (files.length === 0) {
    console.log('[!] Chưa có file ảnh captcha nào trong captcha_dumps/');
    process.exit(1);
  }

  const latestImage = path.join(captchaDir, files[0].name);
  processCaptcha(latestImage);
}

module.exports = { processCaptcha };
