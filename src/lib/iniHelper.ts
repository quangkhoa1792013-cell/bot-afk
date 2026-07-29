export interface INISetting {
  key: string;
  value: any;
  rawValue: string;
  type: 'boolean' | 'number' | 'string' | 'array' | 'object' | 'enum';
  comment?: string;
  options?: string[];
}

export interface INISection {
  id: string;
  name: string;
  category: 'main' | 'signature' | 'logging' | 'console' | 'proxy' | 'mcsettings' | 'chatbot' | 'other';
  categoryLabel: string;
  description?: string;
  settings: INISetting[];
}

// Map section name to friendly category
export function getSectionCategory(sectionName: string): {
  category: INISection['category'];
  categoryLabel: string;
} {
  const name = sectionName.toLowerCase();
  if (name.startsWith('main') || name === 'head' || name.startsWith('appvar')) {
    return { category: 'main', categoryLabel: '🌐 Cấu Hình Chính & Máy Chủ (Main & Server)' };
  }
  if (name.startsWith('signature')) {
    return { category: 'signature', categoryLabel: '🔑 Chữ Ký & Bảo Mật (Signature)' };
  }
  if (name.startsWith('logging')) {
    return { category: 'logging', categoryLabel: '📜 Nhật Ký & Debug (Logging)' };
  }
  if (name.startsWith('console')) {
    return { category: 'console', categoryLabel: '🖥️ Giao Diện Console & Minimap' };
  }
  if (name.startsWith('proxy')) {
    return { category: 'proxy', categoryLabel: '🔌 Mạng & Proxy' };
  }
  if (name.startsWith('mcsettings') || name.startsWith('chatformat')) {
    return { category: 'mcsettings', categoryLabel: '🎮 Cài Đặt Minecraft Client' };
  }
  if (name.startsWith('chatbot')) {
    return { category: 'chatbot', categoryLabel: '🤖 ChatBots & Tự Động Hóa (Auto Bots)' };
  }
  return { category: 'other', categoryLabel: '⚙️ Cấu Hình Khác (Other)' };
}

// Known enums for specific keys
const KNOWN_ENUMS: Record<string, string[]> = {
  MinecraftVersion: ['auto', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.3', '1.19.2', '1.18.2', '1.17.1', '1.16.5', '1.15.2', '1.14.4', '1.12.2', '1.8.9'],
  AccountType: ['mojang', 'microsoft', 'yggdrasil'],
  Method: ['mcc', 'browser'],
  InternalCmdChar: ['none', 'slash', 'backslash'],
  EnableForge: ['auto', 'no', 'force'],
  BrandInfo: ['mcc', 'vanilla', 'none'],
  SessionCache: ['none', 'memory', 'disk'],
  ProfileKeyCache: ['none', 'memory', 'disk'],
  ResolveSrvRecords: ['no', 'fast', 'yes'],
  FilterMode: ['disable', 'blacklist', 'whitelist'],
  ConsoleMode: ['classic', 'tui'],
  ConsoleColorMode: ['disable', 'legacy_4bit', 'vt100_4bit', 'vt100_8bit', 'vt100_24bit'],
  Position: ['top_left', 'top_right', 'center', 'bottom_left', 'bottom_right'],
  CaveMode: ['auto', 'on', 'off'],
  Proxy_Type: ['HTTP', 'SOCKS4', 'SOCKS4a', 'SOCKS5'],
  Difficulty: ['peaceful', 'easy', 'normal', 'difficult'],
  ChatMode: ['enabled', 'commands', 'disabled'],
  MainHand: ['left', 'right'],
  Mode: ['single', 'multi', 'include', 'exclude', 'everything', 'lookat', 'fixedpos', 'both'],
  Priority: ['health', 'distance'],
  Interaction: ['Attack', 'Interact', 'InteractAt'],
  List_Mode: ['whitelist', 'blacklist'],
  List_Type: ['whitelist', 'blacklist'],
  OnFailure: ['abort', 'wait'],
  Location_Order: ['distance', 'index'],
};

function getKnownEnumOptions(rawKey: string): string[] | undefined {
  const matchKey = Object.keys(KNOWN_ENUMS).find((k) => k.toLowerCase() === rawKey.toLowerCase());
  return matchKey ? KNOWN_ENUMS[matchKey] : undefined;
}

// Parse raw INI text into structured sections while preserving comments
export function parseIniToSections(rawIni: string): INISection[] {
  const lines = rawIni.split(/\r?\n/);
  const sections: INISection[] = [];
  let currentSection: INISection | null = null;
  let accumulatedComment = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines
    if (!line) {
      accumulatedComment = '';
      continue;
    }

    // Comment line
    if (line.startsWith('#') || line.startsWith(';')) {
      const commentText = line.replace(/^[#;]\s*/, '').trim();
      if (!commentText.startsWith('===') && !commentText.startsWith('---')) {
        accumulatedComment = accumulatedComment ? `${accumulatedComment} ${commentText}` : commentText;
      }
      continue;
    }

    // Section header line e.g. [Main.General] or [[ChatBot.AutoCraft.Recipes]]
    const sectionMatch = line.match(/^\[{1,2}([^\]]+)\]{1,2}$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim();
      const { category, categoryLabel } = getSectionCategory(sectionName);

      currentSection = {
        id: `sec-${sectionName.replace(/[^a-zA-Z0-9]/g, '_')}-${i}`,
        name: sectionName,
        category,
        categoryLabel,
        description: accumulatedComment || undefined,
        settings: [],
      };
      sections.push(currentSection);
      accumulatedComment = '';
      continue;
    }

    // Key-Value line e.g. Key = Value # comment
    const kvMatch = line.match(/^([a-zA-Z0-9_\-.\s"']+)=\s*(.*)$/);
    if (kvMatch && currentSection) {
      let rawKey = kvMatch[1].trim();
      let rawValAndComment = kvMatch[2].trim();

      // Clean quotes from key if present
      if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
        rawKey = rawKey.slice(1, -1);
      }

      // Extract inline comment if any
      let inlineComment = '';
      let rawVal = rawValAndComment;

      // Handle comments preceded by # or ;
      const hashIdx = rawValAndComment.indexOf('#');
      if (hashIdx !== -1) {
        inlineComment = rawValAndComment.slice(hashIdx + 1).trim();
        rawVal = rawValAndComment.slice(0, hashIdx).trim();
      }

      const combinedComment = [accumulatedComment, inlineComment].filter(Boolean).join(' - ');
      accumulatedComment = '';

      // Determine value type & parsed value
      let parsedValue: any = rawVal;
      let type: INISetting['type'] = 'string';

      // Boolean
      if (rawVal.toLowerCase() === 'true' || rawVal.toLowerCase() === 'false') {
        type = 'boolean';
        parsedValue = rawVal.toLowerCase() === 'true';
      }
      // Number
      else if (!isNaN(Number(rawVal)) && rawVal !== '') {
        type = 'number';
        parsedValue = Number(rawVal);
      }
      // Array e.g. [ "a", "b" ]
      else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        type = 'array';
        try {
          // Parse array items
          const inner = rawVal.slice(1, -1).trim();
          if (!inner) {
            parsedValue = [];
          } else {
            parsedValue = inner
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean)
              .map((item) => item.replace(/^["']|["']$/g, ''));
          }
        } catch {
          parsedValue = [];
        }
      }
      // Inline object e.g. { Login = "geasf", Password = "-" } or { min = 60, max = 60 }
      else if (rawVal.startsWith('{') && rawVal.endsWith('}')) {
        type = 'object';
        parsedValue = rawVal;
      }
      // Enum check
      else {
        // Strip outer quotes if string
        if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
          parsedValue = rawVal.slice(1, -1);
        }
        const opts = getKnownEnumOptions(rawKey);
        if (opts) {
          type = 'enum';
        }
      }

      currentSection.settings.push({
        key: rawKey,
        value: parsedValue,
        rawValue: rawVal,
        type,
        comment: combinedComment || undefined,
        options: getKnownEnumOptions(rawKey),
      });
    }
  }

  return sections;
}

// Serialize structured sections back to raw INI text
export function serializeSectionsToIni(sections: INISection[], originalRawIni?: string): string {
  // If we have sections, build a clean INI text
  const outputLines: string[] = [];
  outputLines.push('# Startup Config File (Generated & Updated by MCC Web Engine)');
  outputLines.push('# Documentation: https://mccteam.github.io/g/conf.html\n');

  for (const sec of sections) {
    if (sec.settings.length === 0 && !sec.description) continue;

    outputLines.push(`[${sec.name}]`);

    for (const setting of sec.settings) {
      let valStr = '';

      if (setting.type === 'boolean') {
        valStr = setting.value ? 'true' : 'false';
      } else if (setting.type === 'number') {
        valStr = String(setting.value);
      } else if (setting.type === 'array') {
        if (Array.isArray(setting.value)) {
          valStr = `[ ${setting.value.map((v) => `"${v}"`).join(', ')} ]`;
        } else {
          valStr = String(setting.value);
        }
      } else if (setting.type === 'object') {
        valStr = String(setting.value);
      } else {
        // String or enum
        const strVal = String(setting.value);
        // Avoid double quoting if already quoted or object format
        if (strVal.startsWith('{') || strVal.startsWith('[')) {
          valStr = strVal;
        } else {
          valStr = `"${strVal}"`;
        }
      }

      // Format key with proper spacing
      let keyFormatted = setting.key;
      if (keyFormatted.includes(' ')) {
        keyFormatted = `"${keyFormatted}"`;
      }

      let line = `${keyFormatted} = ${valStr}`;
      if (setting.comment) {
        line = `${line.padEnd(45)} # ${setting.comment}`;
      }
      outputLines.push(line);
    }

    outputLines.push(''); // Empty separator line between sections
  }

  return outputLines.join('\n');
}

export interface INIRepairResult {
  repairedIni: string;
  fixCount: number;
  logs: string[];
}

// Auto-repair common syntax errors in MinecraftClient.ini
export function fixAndSanitizeIniContent(rawIni: string): INIRepairResult {
  const lines = rawIni.split(/\r?\n/);
  const repairedLines: string[] = [];
  let fixCount = 0;
  const logs: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines or pure comment lines
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      repairedLines.push(line);
      continue;
    }

    // 1. Fix Section Headers e.g. [ChatBot.AutoRespond (missing ']') or [ChatBot.AutoRespond.]
    if (trimmed.startsWith('[')) {
      // Check if missing closing bracket
      if (!trimmed.includes(']')) {
        let name = trimmed.replace(/^\[+/, '').trim();
        name = name.replace(/\.+$|^\.+/g, ''); // strip trailing or leading dots
        line = `[${name}]`;
        fixCount++;
        logs.push(`Dòng ${i + 1}: Thêm dấu ']' còn thiếu cho section header -> [${name}]`);
      } else {
        // Has both brackets, clean up extra dots inside or outside e.g. [ChatBot.AutoRespond.]
        const match = line.match(/^(\s*)\[+([^\]]+)\]+(\s*)$/);
        if (match) {
          const indent = match[1];
          let secName = match[2].trim();
          const cleanName = secName.replace(/^\.+|\.+$|(?<=\.)\.+/g, ''); // remove leading/trailing or double dots
          if (secName !== cleanName) {
            line = `${indent}[${cleanName}]`;
            fixCount++;
            logs.push(`Dòng ${i + 1}: Sửa tên section header -> [${cleanName}]`);
          }
        }
      }
      repairedLines.push(line);
      continue;
    }

    // 2. Fix Inline Object Syntax e.g. Server = { Host = 127.0.0.1, Port = 25565 } or Account = { Login = geasf }
    if (trimmed.includes('{') && trimmed.includes('}')) {
      const kvMatch = line.match(/^(\s*)([a-zA-Z0-9_\-.\s"']+)=\s*\{(.*)\}(\s*#.*)?$/);
      if (kvMatch) {
        const indent = kvMatch[1];
        const key = kvMatch[2].trim();
        const inner = kvMatch[3];
        const comment = kvMatch[4] || '';

        // Process inner properties e.g. Host = 127.0.0.1, Port = 25565
        const props = inner.split(',').map((p) => p.trim()).filter(Boolean);
        let innerModified = false;

        const fixedProps = props.map((prop) => {
          const propMatch = prop.match(/^([a-zA-Z0-9_\-]+)\s*=\s*(.*)$/);
          if (propMatch) {
            const pKey = propMatch[1].trim();
            let pVal = propMatch[2].trim();

            // If value is not quoted, and is not a number, and is not true/false
            if (!pVal.startsWith('"') && !pVal.startsWith("'") && pVal.toLowerCase() !== 'true' && pVal.toLowerCase() !== 'false' && isNaN(Number(pVal))) {
              pVal = `"${pVal}"`;
              innerModified = true;
            }
            return `${pKey} = ${pVal}`;
          }
          return prop;
        });

        if (innerModified) {
          line = `${indent}${key} = { ${fixedProps.join(', ')} }${comment}`;
          fixCount++;
          logs.push(`Dòng ${i + 1}: Sửa dấu ngoặc kép cho đối tượng ${key} -> { ${fixedProps.join(', ')} }`);
        }
      }
      repairedLines.push(line);
      continue;
    }

    // 3. Fix Unquoted Strings e.g. Matches_File = matches.ini or ServerIP = 127.0.0.1 or File = chat.txt
    const kvMatch = line.match(/^(\s*)([a-zA-Z0-9_\-.]+)\s*=\s*(.*)$/);
    if (kvMatch) {
      const indent = kvMatch[1];
      const key = kvMatch[2].trim();
      let valAndComment = kvMatch[3].trim();

      // Separate inline comment
      let val = valAndComment;
      let comment = '';
      const hashIdx = valAndComment.indexOf('#');
      const semiIdx = valAndComment.indexOf(';');
      const commentIdx = hashIdx !== -1 && semiIdx !== -1 ? Math.min(hashIdx, semiIdx) : (hashIdx !== -1 ? hashIdx : semiIdx);

      if (commentIdx !== -1) {
        val = valAndComment.slice(0, commentIdx).trim();
        comment = ' ' + valAndComment.slice(commentIdx).trim();
      }

      // Check if value needs quoting
      if (
        val &&
        !val.startsWith('"') &&
        !val.startsWith("'") &&
        !val.startsWith('[') &&
        !val.startsWith('{') &&
        val.toLowerCase() !== 'true' &&
        val.toLowerCase() !== 'false'
      ) {
        // Check if pure integer or single decimal float (e.g. 25565 or 1.0)
        const isPureNumber = !isNaN(Number(val)) && !val.includes('..') && !/^[0-9]+\.[0-9]+\.[0-9]+/.test(val);

        if (!isPureNumber) {
          const newVal = `"${val}"`;
          line = `${indent}${key} = ${newVal}${comment}`;
          fixCount++;
          logs.push(`Dòng ${i + 1}: Thêm dấu ngoặc kép cho ${key} = ${newVal}`);
        }
      }
    }

    repairedLines.push(line);
  }

  return {
    repairedIni: repairedLines.join('\n'),
    fixCount,
    logs,
  };
}
