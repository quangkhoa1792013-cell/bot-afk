'use strict';

const { MAP_SIZE } = require('./map_palette');

const BUFFER_SIZE = MAP_SIZE * MAP_SIZE; // 16384 bytes

// createMapBuffer() -> Uint8Array(16384), all pixels unexplored (0).
function createMapBuffer() {
  return new Uint8Array(BUFFER_SIZE);
}

// applyMapPacket(buffer, packet) places one 1.20.1 'map' packet patch into the
// 128x128 buffer. Matches vanilla client MapItemSavedData.MapPatch.applyToMap:
//   buffer[(packet.y + row) * 128 + (packet.x + col)] = data[row * packet.columns + col]
// (patch data is row-major; x = column offset, y = row offset).
// Packets with columns === 0 carry no pixel data and are ignored.
// Returns true if the buffer changed.
function applyMapPacket(buffer, packet) {
  if (!packet || !packet.columns || packet.columns <= 0) {
    return false;
  }
  const columns = packet.columns;
  const rows = packet.rows || packet.height || 0;
  const x = packet.x || 0;
  const y = packet.y !== undefined ? packet.y : (packet.z || 0);
  const data = packet.data;
  if (!data || data.length < columns * rows) {
    return false;
  }
  let changed = false;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const src = row * columns + col;
      const dst = (y + row) * MAP_SIZE + (x + col);
      if (dst >= 0 && dst < BUFFER_SIZE) {
        if (buffer[dst] !== data[src]) {
          buffer[dst] = data[src];
          changed = true;
        }
      }
    }
  }
  return changed;
}

// filledPixelCount(buffer) -> number of non-zero pixels (progress metric).
function filledPixelCount(buffer) {
  let count = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== 0) count++;
  }
  return count;
}

module.exports = { createMapBuffer, applyMapPacket, filledPixelCount, BUFFER_SIZE, MAP_SIZE };
