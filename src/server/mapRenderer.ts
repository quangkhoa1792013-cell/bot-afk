import { PNG } from 'pngjs';

// Official Minecraft Map Color Palette (Base Colors index 0-63 mapped to RGBA)
// Base color multipliers: 0 = 180, 1 = 220, 2 = 255, 3 = 135
const BASE_MAP_PALETTE: Array<[number, number, number]> = [
  [0, 0, 0],         // 0: None
  [127, 178, 56],    // 1: Grass
  [247, 233, 163],   // 2: Sand
  [199, 199, 199],   // 3: Wool / Web
  [255, 0, 0],       // 4: Fire / Redstone
  [160, 160, 255],   // 5: Ice
  [167, 167, 167],   // 6: Iron
  [0, 124, 0],       // 7: Foliage
  [255, 255, 255],   // 8: Snow
  [164, 168, 184],   // 9: Clay
  [151, 109, 77],    // 10: Dirt
  [112, 112, 112],   // 11: Stone
  [64, 64, 255],     // 12: Water
  [143, 119, 72],    // 13: Oak Wood
  [255, 252, 245],   // 14: Quartz
  [216, 127, 51],    // 15: Orange
  [178, 76, 216],    // 16: Magenta
  [102, 153, 216],   // 17: Light Blue
  [229, 229, 51],    // 18: Yellow
  [127, 204, 25],    // 19: Lime
  [242, 127, 165],   // 20: Pink
  [76, 76, 76],      // 21: Gray
  [153, 153, 153],   // 22: Light Gray
  [76, 127, 153],    // 23: Cyan
  [127, 63, 178],    // 24: Purple
  [51, 76, 178],     // 25: Blue
  [102, 76, 51],     // 26: Brown
  [102, 127, 51],    // 27: Green
  [153, 51, 51],     // 28: Red
  [25, 25, 25],      // 29: Black
  [250, 238, 77],    // 30: Gold
  [92, 219, 213],    // 31: Diamond
  [74, 128, 255],    // 32: Lapis
  [0, 217, 58],      // 33: Emerald
  [129, 86, 49],     // 34: Spruce
  [112, 2, 0],       // 35: Netherrack
];

// Helper to convert color index to RGBA
function getMinecraftMapColor(colorId: number): [number, number, number, number] {
  const baseId = Math.floor(colorId / 4);
  const shade = colorId % 4;

  const base = BASE_MAP_PALETTE[baseId] || [232, 216, 171]; // Default map parchment
  let mult = 1.0;
  if (shade === 0) mult = 0.71;
  if (shade === 1) mult = 0.86;
  if (shade === 2) mult = 1.0;
  if (shade === 3) mult = 0.53;

  return [
    Math.min(255, Math.round(base[0] * mult)),
    Math.min(255, Math.round(base[1] * mult)),
    Math.min(255, Math.round(base[2] * mult)),
    255,
  ];
}

// In-memory buffer store for latest PNG Map Captcha image
let currentCaptchaPngBuffer: Buffer | null = null;
let currentCaptchaCodeText: string = '8492';

export function renderMapPaletteToPngBuffer(colors: number[] | Uint8Array, width = 128, height = 128): Buffer {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const colorId = colors[idx] ?? 2; // Default sand color
      const [r, g, b, a] = getMinecraftMapColor(colorId);

      const pngIdx = (width * y + x) << 2;
      png.data[pngIdx] = r;
      png.data[pngIdx + 1] = g;
      png.data[pngIdx + 2] = b;
      png.data[pngIdx + 3] = a;
    }
  }

  return PNG.sync.write(png);
}

// Generate a sample crisp Map Captcha PNG buffer with custom digit text
export function generateSampleCaptchaPngBuffer(digitsText: string): Buffer {
  currentCaptchaCodeText = digitsText;
  const width = 128;
  const height = 128;
  const png = new PNG({ width, height });

  // 1. Draw Map Parchment Background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      // Border frame check
      if (x < 3 || x >= width - 3 || y < 3 || y >= height - 3) {
        png.data[idx] = 90;     // Wood border R
        png.data[idx + 1] = 60; // Wood border G
        png.data[idx + 2] = 30; // Wood border B
        png.data[idx + 3] = 255;
      } else {
        // Parchment map color with subtle texture
        const noise = ((x * 17 + y * 31) % 15) - 7;
        png.data[idx] = Math.min(255, Math.max(0, 232 + noise));     // R
        png.data[idx + 1] = Math.min(255, Math.max(0, 216 + noise)); // G
        png.data[idx + 2] = Math.min(255, Math.max(0, 171 + noise)); // B
        png.data[idx + 3] = 255;
      }
    }
  }

  // 2. Draw Pixelated Digits on Map
  const cleanDigits = digitsText.replace(/\s+/g, '');
  const fontPixels: Record<string, number[][]> = {
    '0': [[1,1,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
    '1': [[0,1,0],[1,1,0],[0,1,0],[0,1,0],[1,1,1]],
    '2': [[1,1,1],[0,0,1],[1,1,1],[1,0,0],[1,1,1]],
    '3': [[1,1,1],[0,0,1],[1,1,1],[0,0,1],[1,1,1]],
    '4': [[1,0,1],[1,0,1],[1,1,1],[0,0,1],[0,0,1]],
    '5': [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
    '6': [[1,1,1],[1,0,0],[1,1,1],[1,0,1],[1,1,1]],
    '7': [[1,1,1],[0,0,1],[0,1,0],[1,0,0],[1,0,0]],
    '8': [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,1,1]],
    '9': [[1,1,1],[1,0,1],[1,1,1],[0,0,1],[1,1,1]],
  };

  const startX = Math.floor((width - (cleanDigits.length * 20)) / 2);
  const startY = 48;
  const pixelScale = 4; // 4x4 scale for crisp pixelated look

  cleanDigits.split('').forEach((ch, charIdx) => {
    const glyph = fontPixels[ch] || fontPixels['8'];
    const charX = startX + charIdx * 20;

    for (let r = 0; r < glyph.length; r++) {
      for (let c = 0; c < glyph[r].length; c++) {
        if (glyph[r][c] === 1) {
          // Draw scaled pixel
          for (let py = 0; py < pixelScale; py++) {
            for (let px = 0; px < pixelScale; px++) {
              const drawX = charX + c * pixelScale + px;
              const drawY = startY + r * pixelScale + py;

              if (drawX >= 0 && drawX < width && drawY >= 0 && drawY < height) {
                const pIdx = (width * drawY + drawX) << 2;
                png.data[pIdx] = 15;     // Deep black/navy
                png.data[pIdx + 1] = 23;
                png.data[pIdx + 2] = 42;
                png.data[pIdx + 3] = 255;
              }
            }
          }
        }
      }
    }
  });

  const buffer = PNG.sync.write(png);
  currentCaptchaPngBuffer = buffer;
  return buffer;
}

export function getCurrentCaptchaPngBuffer(): Buffer {
  if (!currentCaptchaPngBuffer) {
    return generateSampleCaptchaPngBuffer('8492');
  }
  return currentCaptchaPngBuffer;
}

export function updateCurrentCaptchaPngBuffer(buffer: Buffer) {
  currentCaptchaPngBuffer = buffer;
}
