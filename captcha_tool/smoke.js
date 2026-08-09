'use strict';

// Simulates a real AquaMC-style captcha: the server pushes map patches in chunks
// (dirty-rectangle updates), never necessarily the full 128x128 at once.
// Verifies the assembled buffer + palette rendering + PNG output end to end.

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { createMapBuffer, applyMapPacket, filledPixelCount } = require('./map_assembler');
const { renderBufferToPNG } = require('./render');
const { byteToRGBA } = require('./map_palette');

const dumpsDir = path.join(__dirname, 'dumps');
if (!fs.existsSync(dumpsDir)) fs.mkdirSync(dumpsDir);

// Build a "captcha" ground truth directly in map-byte space: a 4x6 block pattern
// of colors (like digit glyphs) on a GRASS background, plus random noise border.
const buf = createMapBuffer();
const glyphs = [
  // '7' pattern
  [
    [2, 2, 2, 2],
    [0, 0, 0, 2],
    [0, 0, 2, 0],
    [0, 2, 0, 0],
    [0, 2, 0, 0],
    [0, 0, 0, 0]
  ],
  // 'A' pattern
  [
    [0, 2, 2, 0],
    [2, 0, 0, 2],
    [2, 2, 2, 2],
    [2, 0, 0, 2],
    [2, 0, 0, 2],
    [0, 0, 0, 0]
  ],
  // '3' pattern
  [
    [2, 2, 2, 2],
    [0, 0, 0, 2],
    [0, 0, 2, 0],
    [0, 0, 0, 2],
    [2, 2, 2, 2],
    [0, 0, 0, 0]
  ]
];

// Paint ground truth: background GRASS shade 2 (byte 6), glyphs WOOL shade 2 (byte 14), WOOL dark (byte 15).
for (let y = 0; y < 128; y++) {
  for (let x = 0; x < 128; x++) {
    buf[y * 128 + x] = 6;
  }
}
glyphs.forEach((glyph, gi) => {
  for (let gy = 0; gy < 6; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      if (glyph[gy][gx]) {
        buf[(20 + gy) * 128 + (20 + gi * 8 + gx)] = glyph[gy][gx] === 2 ? 14 : 15;
      }
    }
  }
});
for (let i = 0; i < 200; i++) {
  buf[Math.floor(Math.random() * 128) * 128 + Math.floor(Math.random() * 128)] = 4 + Math.floor(Math.random() * 4);
}

// Now simulate packets: first full map, then two partial dirty patches.
function chunkIntoPackets(full, patchSpecs) {
  const packets = [
    {
      itemDamage: 9001, scale: 0, locked: false,
      columns: 128, rows: 128, x: 0, y: 0,
      data: Buffer.from(full)
    }
  ];
  for (const spec of patchSpecs) {
    const { x, y, w, h } = spec;
    const data = Buffer.alloc(w * h);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        data[row * w + col] = full[(y + row) * 128 + (x + col)];
      }
    }
    packets.push({ itemDamage: 9001, scale: 0, locked: false, columns: w, rows: h, x, y, data });
  }
  return packets;
}

const assembled = createMapBuffer();
const packets = chunkIntoPackets(buf, [
  { x: 20, y: 18, w: 32, h: 12 },
  { x: 0, y: 60, w: 128, h: 20 }
]);
for (const p of packets) applyMapPacket(assembled, p);

// Ground truth equals assembled
let identical = true;
for (let i = 0; i < 16384; i++) {
  if (assembled[i] !== buf[i]) { identical = false; break; }
}
if (!identical) {
  console.error('SMOKE FAIL: assembled buffer differs from ground truth');
  process.exit(1);
}
console.log(`assembled buffer matches ground truth (${filledPixelCount(assembled)}/16384 px)`);

const png = renderBufferToPNG(assembled);
const ts = Date.now();
const pngPath = path.join(dumpsDir, `smoke_${ts}.png`);
png.pack().pipe(fs.createWriteStream(pngPath)).on('finish', () => {
  console.log(`wrote ${pngPath}`);
});
fs.writeFileSync(path.join(dumpsDir, 'latest.png'), PNG.sync.write(png));
console.log('wrote dumps/latest.png');

// Sanity: a known pixel
const [r, g, b] = byteToRGBA(assembled[20 * 128 + 20]);
console.log(`sample glyph pixel (20,20) RGBA = ${byteToRGBA(assembled[20 * 128 + 20])}`);
console.log(`sample bg pixel (100,100) RGBA = ${byteToRGBA(assembled[100 * 128 + 100])}`);

const meta = {
  mapId: 9001, scale: 0, locked: false, timestamp: ts,
  packetCount: packets.length,
  filledPixels: filledPixelCount(assembled),
  iconCount: 0,
  source: 'smoke-test'
};
fs.writeFileSync(path.join(dumpsDir, 'latest.json'), JSON.stringify(meta, null, 2));
console.log('wrote dumps/latest.json');
