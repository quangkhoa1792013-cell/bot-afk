/**
 * Minecraft Chat Color and Format Parser
 * Converts Mineflayer chat objects, string with § or & color codes, or JSON chat components to HTML/Spans.
 * Supports full 1.16+ RGB Hex codes (&#RRGGBB, §x§1§2§3§4§5§6) and named color maps.
 */

const COLOR_MAP: Record<string, string> = {
  '0': '#000000', // Black
  '1': '#0000AA', // Dark Blue
  '2': '#00AA00', // Dark Green
  '3': '#00AAAA', // Dark Aqua
  '4': '#AA0000', // Dark Red
  '5': '#AA00AA', // Dark Purple
  '6': '#FFAA00', // Gold
  '7': '#AAAAAA', // Gray
  '8': '#555555', // Dark Gray
  '9': '#5555FF', // Blue
  'a': '#55FF55', // Green
  'b': '#55FFFF', // Aqua
  'c': '#FF5555', // Red
  'd': '#FF55FF', // Light Purple
  'e': '#FFFF55', // Yellow
  'f': '#FFFFFF', // White
  // Named colors in JSON chat
  black: '#000000',
  dark_blue: '#0000AA',
  dark_green: '#00AA00',
  dark_aqua: '#00AAAA',
  dark_red: '#AA0000',
  dark_purple: '#AA00AA',
  gold: '#FFAA00',
  gray: '#AAAAAA',
  dark_gray: '#555555',
  blue: '#5555FF',
  green: '#55FF55',
  aqua: '#55FFFF',
  red: '#FF5555',
  light_purple: '#FF55FF',
  yellow: '#FFFF55',
  white: '#FFFFFF',
  reset: '#FFFFFF',
};

export interface ChatPiece {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underlined?: boolean;
  strikethrough?: boolean;
  obfuscated?: boolean;
}

export function parseMcColorCodes(input: string): ChatPiece[] {
  if (!input) return [];

  // Pre-process §x§R§R§G§G§B§B or &x&R&R&G&G&B&B legacy hex formats into &#RRGGBB
  let normalized = input.replace(/[§&]x([§&][0-9a-fA-F]){6}/gi, (match) => {
    const chars = match.replace(/[§&]x/i, '').replace(/[§&]/g, '');
    return `&#${chars}`;
  });

  const pieces: ChatPiece[] = [];
  const regex = /(?:[§&]([0-9a-fk-or]))|(?:[§&]#([0-9a-fA-F]{6}))|([^§&]+)/g;

  let currentColor = '#FFFFFF';
  let bold = false;
  let italic = false;
  let underlined = false;
  let strikethrough = false;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const code = match[1]?.toLowerCase();
    const hexColor = match[2];
    const text = match[3];

    if (hexColor) {
      currentColor = `#${hexColor}`;
    } else if (code) {
      if (COLOR_MAP[code]) {
        currentColor = COLOR_MAP[code];
        bold = false;
        italic = false;
        underlined = false;
        strikethrough = false;
      } else if (code === 'l') {
        bold = true;
      } else if (code === 'm') {
        strikethrough = true;
      } else if (code === 'n') {
        underlined = true;
      } else if (code === 'o') {
        italic = true;
      } else if (code === 'r') {
        currentColor = '#FFFFFF';
        bold = false;
        italic = false;
        underlined = false;
        strikethrough = false;
      }
    } else if (text) {
      pieces.push({
        text,
        color: currentColor,
        bold,
        italic,
        underlined,
        strikethrough,
      });
    }
  }

  if (pieces.length === 0 && input) {
    pieces.push({ text: input, color: '#FFFFFF' });
  }

  return pieces;
}

export function unwrapNbt(nbt: any): any {
  if (!nbt || typeof nbt !== 'object') return nbt;

  // Handle prismarine-nbt compound { type: "compound", value: { ... } }
  if (nbt.type === 'compound' && nbt.value && typeof nbt.value === 'object') {
    const result: Record<string, any> = {};
    for (const key of Object.keys(nbt.value)) {
      const field = nbt.value[key];
      const targetKey = key === '' ? 'text' : key;
      result[targetKey] = unwrapNbt(field);
    }
    return result;
  }

  // Handle prismarine-nbt list { type: "list", value: { type: "compound", value: [...] } } or value: [...]
  if (nbt.type === 'list' && nbt.value) {
    if (Array.isArray(nbt.value)) {
      return nbt.value.map(unwrapNbt);
    }
    if (nbt.value && typeof nbt.value === 'object' && Array.isArray(nbt.value.value)) {
      return nbt.value.value.map(unwrapNbt);
    }
    return unwrapNbt(nbt.value);
  }

  // Handle primitive NBT tags like { type: "string" | "byte" | "int", value: val }
  if (nbt.type && nbt.value !== undefined) {
    if (nbt.type === 'byte') {
      return nbt.value === 1 ? true : nbt.value === 0 ? false : nbt.value;
    }
    return unwrapNbt(nbt.value);
  }

  // Handle array
  if (Array.isArray(nbt)) {
    return nbt.map(unwrapNbt);
  }

  // Handle standard object
  const res: Record<string, any> = {};
  for (const k of Object.keys(nbt)) {
    res[k] = unwrapNbt(nbt[k]);
  }
  return res;
}

export function parseMcJsonMessage(jsonMsg: any): ChatPiece[] {
  if (!jsonMsg) return [];
  const unwrapped = unwrapNbt(jsonMsg);
  const pieces: ChatPiece[] = [];

  function processComponent(
    comp: any,
    inheritedColor?: string,
    inheritedBold?: boolean,
    inheritedItalic?: boolean,
    inheritedUnderline?: boolean,
    inheritedStrike?: boolean
  ) {
    if (!comp) return;

    if (typeof comp === 'string' || typeof comp === 'number') {
      const parsed = parseMcColorCodes(String(comp));
      for (const piece of parsed) {
        pieces.push({
          ...piece,
          color: piece.color !== '#FFFFFF' ? piece.color : inheritedColor || piece.color,
          bold: piece.bold || inheritedBold,
          italic: piece.italic || inheritedItalic,
          underlined: piece.underlined || inheritedUnderline,
          strikethrough: piece.strikethrough || inheritedStrike,
        });
      }
      return;
    }

    if (Array.isArray(comp)) {
      for (const item of comp) {
        processComponent(
          item,
          inheritedColor,
          inheritedBold,
          inheritedItalic,
          inheritedUnderline,
          inheritedStrike
        );
      }
      return;
    }

    const text = comp.text || comp.translate || '';
    let rawColor = comp.color || inheritedColor || '#FFFFFF';
    let color = rawColor;

    if (COLOR_MAP[rawColor.toLowerCase()]) {
      color = COLOR_MAP[rawColor.toLowerCase()];
    } else if (rawColor.startsWith('#')) {
      color = rawColor;
    } else {
      color = '#FFFFFF';
    }

    const isBold = comp.bold !== undefined ? !!comp.bold : inheritedBold;
    const isItalic = comp.italic !== undefined ? !!comp.italic : inheritedItalic;
    const isUnderlined = comp.underlined !== undefined ? !!comp.underlined : inheritedUnderline;
    const isStrikethrough = comp.strikethrough !== undefined ? !!comp.strikethrough : inheritedStrike;

    if (text) {
      const subPieces = parseMcColorCodes(text);
      for (const sp of subPieces) {
        pieces.push({
          text: sp.text,
          color: sp.color !== '#FFFFFF' ? sp.color : color,
          bold: sp.bold || isBold,
          italic: sp.italic || isItalic,
          underlined: sp.underlined || isUnderlined,
          strikethrough: sp.strikethrough || isStrikethrough,
        });
      }
    }

    if (comp.extra && Array.isArray(comp.extra)) {
      for (const extraItem of comp.extra) {
        processComponent(
          extraItem,
          color,
          isBold,
          isItalic,
          isUnderlined,
          isStrikethrough
        );
      }
    }
  }

  processComponent(unwrapped);
  return pieces;
}

export function parseMcLogMessage(
  log: { text: string; json?: any },
  isDebugMode: boolean = false
): ChatPiece[] {
  if (isDebugMode) {
    const rawText = log.text || (typeof log.json === 'string' ? log.json : JSON.stringify(log.json));
    return [{ text: rawText, color: '#94A3B8' }];
  }

  // Debug OFF: Format and style cleanly
  if (log.json) {
    return parseMcJsonMessage(log.json);
  }

  const text = log.text || '';

  // Check if text contains embedded JSON/NBT compound (e.g. "Bot stopped: Disconnected (Kicked: {"type":"compound"...})")
  const jsonMatch = text.match(/^(.*?)(\{[\s\S]*\}|\[[\s\S]*\])(.*?)$/);
  if (jsonMatch) {
    const prefix = jsonMatch[1];
    const jsonStr = jsonMatch[2];
    const suffix = jsonMatch[3];

    try {
      const parsedJson = JSON.parse(jsonStr);
      const unwrapped = unwrapNbt(parsedJson);
      const parsedPieces = parseMcJsonMessage(unwrapped);

      const pieces: ChatPiece[] = [];
      if (prefix) {
        pieces.push(...parseMcColorCodes(prefix));
      }
      pieces.push(...parsedPieces);
      if (suffix) {
        pieces.push(...parseMcColorCodes(suffix));
      }
      return pieces;
    } catch (e) {
      // If JSON parsing fails, fallback to normal color code parsing
    }
  }

  return parseMcColorCodes(text);
}

export function extractPlainTextFromMcJson(input: any): string {
  if (!input) return '';

  if (typeof input === 'string') {
    // Try to parse JSON if string starts with { or [
    const trimmed = input.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractPlainTextFromMcJson(parsed);
      } catch (e) {
        // Fallback to strip § and & color codes
      }
    }
    return input.replace(/[§&][0-9a-fk-or]/gi, '').replace(/[§&]#[0-9a-fA-F]{6}/gi, '').trim();
  }

  let result = '';

  if (typeof input === 'object') {
    if (input.text) result += input.text;
    if (input.translate) result += input.translate;

    if (Array.isArray(input.extra)) {
      for (const extraItem of input.extra) {
        result += extractPlainTextFromMcJson(extraItem);
      }
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        result += extractPlainTextFromMcJson(item);
      }
    }
  }

  return result.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}
