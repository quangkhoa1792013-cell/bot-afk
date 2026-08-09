'use strict';

const { PNG } = require('pngjs');
const { byteToRGBA, MAP_SIZE } = require('./map_palette');

// renderBufferToPNG(buffer) -> pngjs PNG instance (128x128 RGBA).
// Byte value 0 (unexplored) is fully transparent, everything else uses the
// vanilla 1.20.1 map palette.
function renderBufferToPNG(buffer) {
  const png = new PNG({ width: MAP_SIZE, height: MAP_SIZE });
  for (let i = 0; i < buffer.length; i++) {
    const [r, g, b, a] = byteToRGBA(buffer[i]);
    const idx = i * 4;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = a;
  }
  return png;
}

module.exports = { renderBufferToPNG };
