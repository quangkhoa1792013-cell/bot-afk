'use strict';

const assert = require('assert');
const { byteToRGBA, BASE_COLORS, SHADE_MULTIPLIERS, MAP_SIZE } = require('./map_palette');
const { createMapBuffer, applyMapPacket, filledPixelCount, BUFFER_SIZE } = require('./map_assembler');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

// ---------- Palette tests ----------

check('palette: byte 6 = GRASS shade 2 (no multiplier)', () => {
  assert.deepStrictEqual(byteToRGBA(6), [127, 184, 56, 255]);
});

check('palette: byte 4 = GRASS shade 0 (x180)', () => {
  // 127*180/255=89.64->89, 184*180/255=129.88->129, 56*180/255=39.5->39
  assert.deepStrictEqual(byteToRGBA(4), [89, 129, 39, 255]);
});

check('palette: byte 7 = GRASS shade 3 (x135)', () => {
  // 127*135/255=67.2->67, 184*135/255=97.4->97, 56*135/255=29.6->29
  assert.deepStrictEqual(byteToRGBA(7), [67, 97, 29, 255]);
});

check('palette: byte 0 = transparent', () => {
  assert.deepStrictEqual(byteToRGBA(0), [0, 0, 0, 0]);
});

check('palette: byte 255 = base 63 (NONE) = transparent', () => {
  assert.deepStrictEqual(byteToRGBA(255), [0, 0, 0, 0]);
});

check('palette: byte 33 = SNOW shade 1 (x220)', () => {
  // 255*220/255 = 220
  assert.deepStrictEqual(byteToRGBA(33), [220, 220, 220, 255]);
});

check('palette: byte 51 = WATER shade 3 (x135)', () => {
  // 64*135/255=33.88->33, 255*135/255=135
  assert.deepStrictEqual(byteToRGBA(51), [33, 33, 135, 255]);
});

check('palette: all 256 bytes match vanilla formula (independent impl)', () => {
  for (let b = 0; b < 256; b++) {
    const base = b >> 2;
    const mult = SHADE_MULTIPLIERS[b & 3];
    let expected;
    if (base === 0 || base >= BASE_COLORS.length) {
      expected = [0, 0, 0, 0];
    } else {
      const color = BASE_COLORS[base];
      expected = [
        Math.floor((color >> 16 & 255) * mult / 255),
        Math.floor((color >> 8 & 255) * mult / 255),
        Math.floor((color & 255) * mult / 255),
        255
      ];
    }
    assert.deepStrictEqual(byteToRGBA(b), expected, `byte ${b}`);
  }
});

check('palette: base 0 (all 4 shades) transparent', () => {
  for (let b = 0; b < 4; b++) {
    assert.deepStrictEqual(byteToRGBA(b), [0, 0, 0, 0]);
  }
});

check('palette: high shade never exceeds base color channel', () => {
  for (let b = 0; b < 256; b++) {
    const [r, g, bl, a] = byteToRGBA(b);
    const base = b >> 2;
    if (base === 0 || base >= BASE_COLORS.length) continue;
    const color = BASE_COLORS[base];
    assert.ok(r <= (color >> 16 & 255) && g <= (color >> 8 & 255) && bl <= (color & 255),
      `byte ${b} exceeds base channels`);
  }
});

// ---------- Assembler tests ----------

check('assembler: full 128x128 patch fills buffer row-major', () => {
  const buf = createMapBuffer();
  const data = new Uint8Array(BUFFER_SIZE);
  for (let i = 0; i < data.length; i++) data[i] = (i % 255) + 1; // never 0
  const changed = applyMapPacket(buf, { columns: 128, rows: 128, x: 0, y: 0, data });
  assert.strictEqual(changed, true);
  for (let i = 0; i < BUFFER_SIZE; i++) {
    assert.strictEqual(buf[i], data[i], `index ${i}`);
  }
  assert.strictEqual(filledPixelCount(buf), BUFFER_SIZE);
});

check('assembler: partial patch placed at (x=10, y=20) row-major', () => {
  const buf = createMapBuffer();
  const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  applyMapPacket(buf, { columns: 4, rows: 3, x: 10, y: 20, data });
  assert.strictEqual(buf[20 * 128 + 10], 0);  // row0 col0
  assert.strictEqual(buf[20 * 128 + 13], 3);  // row0 col3
  assert.strictEqual(buf[21 * 128 + 10], 4);  // row1 col0
  assert.strictEqual(buf[21 * 128 + 12], 6);  // row1 col2
  assert.strictEqual(buf[22 * 128 + 10], 8);  // row2 col0
  assert.strictEqual(buf[22 * 128 + 12], 10); // row2 col2
  assert.strictEqual(buf[22 * 128 + 13], 11); // row2 col3
  assert.strictEqual(buf[19 * 128 + 10], 0);  // above patch untouched
  assert.strictEqual(buf[20 * 128 + 14], 0);  // right of patch untouched
  assert.strictEqual(filledPixelCount(buf), 11); // data[0]=0 stays transparent
});

check('assembler: overlapping patches - later write wins', () => {
  const buf = createMapBuffer();
  const full = new Uint8Array(BUFFER_SIZE).fill(9);
  applyMapPacket(buf, { columns: 128, rows: 128, x: 0, y: 0, data: full });
  applyMapPacket(buf, { columns: 2, rows: 2, x: 0, y: 0, data: new Uint8Array([1, 2, 3, 4]) });
  assert.strictEqual(buf[0], 1);
  assert.strictEqual(buf[1], 2);
  assert.strictEqual(buf[128], 3);
  assert.strictEqual(buf[129], 4);
  assert.strictEqual(buf[2], 9);   // outside patch B, still from full patch
  assert.strictEqual(buf[256], 9);
});

check('assembler: columns=0 packet (metadata only) is ignored', () => {
  const buf = createMapBuffer();
  const changed = applyMapPacket(buf, { itemDamage: 1, scale: 0, locked: false, columns: 0 });
  assert.strictEqual(changed, false);
  assert.strictEqual(filledPixelCount(buf), 0);
});

check('assembler: missing/undersized data is ignored', () => {
  const buf = createMapBuffer();
  const changed = applyMapPacket(buf, { columns: 8, rows: 8, x: 0, y: 0, data: new Uint8Array(4) });
  assert.strictEqual(changed, false);
});

check('assembler: y via packet.z fallback (mineflayer-style naming)', () => {
  const buf = createMapBuffer();
  applyMapPacket(buf, { columns: 2, rows: 1, x: 5, z: 7, data: new Uint8Array([42, 43]) });
  assert.strictEqual(buf[7 * 128 + 5], 42);
  assert.strictEqual(buf[7 * 128 + 6], 43);
});

check('assembler: incremental patches accumulate', () => {
  const buf = createMapBuffer();
  const patch1 = new Uint8Array(128 * 128);
  for (let row = 0; row < 128; row++) {
    for (let col = 0; col < 128; col++) {
      patch1[row * 128 + col] = row < 64 ? 6 : 0;
    }
  }
  applyMapPacket(buf, { columns: 128, rows: 128, x: 0, y: 0, data: patch1 });
  const patch2 = new Uint8Array(128 * 128);
  for (let row = 64; row < 128; row++) {
    for (let col = 0; col < 128; col++) {
      patch2[(row - 64) * 128 + col] = row >= 64 ? 4 : 0;
    }
  }
  applyMapPacket(buf, { columns: 128, rows: 128, x: 0, y: 64, data: patch2 });
  assert.strictEqual(buf[63 * 128 + 10], 6);
  assert.strictEqual(buf[64 * 128 + 10], 4);
  assert.strictEqual(buf[127 * 128 + 127], 4);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
