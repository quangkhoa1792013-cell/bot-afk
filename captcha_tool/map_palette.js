'use strict';

// Vanilla 1.20.1 map palette, extracted verbatim from
// net.minecraft.world.level.material.MapColor (Mojang official source).
// BASE_COLORS[i] = 24-bit RGB int of base color id i (0..61). Id 63 = NONE (transparent).
const BASE_COLORS = [
  0x000000, // 0  NONE (transparent)
  0x7fb838, // 1  GRASS
  0xf7e3a3, // 2  SAND
  0xc7c7c7, // 3  WOOL
  0xff0000, // 4  FIRE
  0xa0a0ff, // 5  ICE
  0xa7a7a7, // 6  METAL
  0x007c00, // 7  PLANT
  0xffffff, // 8  SNOW
  0xa4a8b8, // 9  CLAY
  0x976d4d, // 10 DIRT
  0x707070, // 11 STONE
  0x4040ff, // 12 WATER
  0x8f7748, // 13 WOOD
  0xfffcf5, // 14 QUARTZ
  0xd87f33, // 15 COLOR_ORANGE
  0xb24cd8, // 16 COLOR_MAGENTA
  0x6699d8, // 17 COLOR_LIGHT_BLUE
  0xe5e533, // 18 COLOR_YELLOW
  0x7fcc19, // 19 COLOR_LIGHT_GREEN
  0xf27fa5, // 20 COLOR_PINK
  0x4c4c4c, // 21 COLOR_GRAY
  0x999999, // 22 COLOR_LIGHT_GRAY
  0x4c7f99, // 23 COLOR_CYAN
  0x7f3fb2, // 24 COLOR_PURPLE
  0x334cb2, // 25 COLOR_BLUE
  0x664c33, // 26 COLOR_BROWN
  0x667f33, // 27 COLOR_GREEN
  0x993333, // 28 COLOR_RED
  0x191919, // 29 COLOR_BLACK
  0xfaee4d, // 30 GOLD
  0x5cdcd5, // 31 DIAMOND
  0x4a80ff, // 32 LAPIS
  0x00d93a, // 33 EMERALD
  0x815631, // 34 PODZOL
  0x700200, // 35 NETHER
  0xd1b1a1, // 36 TERRACOTTA_WHITE
  0x9f5224, // 37 TERRACOTTA_ORANGE
  0x95576c, // 38 TERRACOTTA_MAGENTA
  0x706c8a, // 39 TERRACOTTA_LIGHT_BLUE
  0xba8524, // 40 TERRACOTTA_YELLOW
  0x677535, // 41 TERRACOTTA_LIGHT_GREEN
  0xa04d4e, // 42 TERRACOTTA_PINK
  0x392923, // 43 TERRACOTTA_GRAY
  0x876b62, // 44 TERRACOTTA_LIGHT_GRAY
  0x575c5c, // 45 TERRACOTTA_CYAN
  0x7a4958, // 46 TERRACOTTA_PURPLE
  0x4c3e5c, // 47 TERRACOTTA_BLUE
  0x4c3223, // 48 TERRACOTTA_BROWN
  0x4c522a, // 49 TERRACOTTA_GREEN
  0x8e3c2e, // 50 TERRACOTTA_RED
  0x251610, // 51 TERRACOTTA_BLACK
  0xbd3031, // 52 CRIMSON_NYLIUM
  0x943f61, // 53 CRIMSON_STEM
  0x5c191d, // 54 CRIMSON_HYPHAE
  0x167f86, // 55 WARPED_NYLIUM
  0x3a8e8c, // 56 WARPED_STEM
  0x562c3e, // 57 WARPED_HYPHAE
  0x14b485, // 58 WARPED_WART_BLOCK
  0x646464, // 59 DEEPSLATE
  0xd8af93, // 60 RAW_IRON
  0x7fa796  // 61 GLOW_LICHEN
];

// Brightness multipliers for shade bits (0..3): LOW, NORMAL, HIGH, LOWEST.
const SHADE_MULTIPLIERS = [180, 220, 255, 135];

const MAP_SIZE = 128;
const NONE_ID = 0;

// byteToRGBA(byteValue) -> [r, g, b, a], byteValue treated as unsigned 0..255.
// Matches vanilla MapColor.getColorFromPackedId: base = byte >> 2, shade = byte & 3,
// rgb = baseRgb * multiplier / 255 (integer floor division). Base id 0 / 63 -> transparent.
function byteToRGBA(byteValue) {
  const packed = byteValue & 255;
  const base = packed >> 2;
  if (base === NONE_ID || base >= BASE_COLORS.length) {
    return [0, 0, 0, 0];
  }
  const color = BASE_COLORS[base];
  if (color === 0) {
    return [0, 0, 0, 0];
  }
  const mult = SHADE_MULTIPLIERS[packed & 3];
  return [
    Math.floor((color >> 16 & 255) * mult / 255),
    Math.floor((color >> 8 & 255) * mult / 255),
    Math.floor((color & 255) * mult / 255),
    255
  ];
}

module.exports = { BASE_COLORS, SHADE_MULTIPLIERS, MAP_SIZE, byteToRGBA };
