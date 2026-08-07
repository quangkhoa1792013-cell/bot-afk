import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import fsPromises from 'fs/promises';
import pathModule from 'path';
import { WebSocket } from 'ws';
import Convert from 'ansi-to-html';
import ini from 'ini';
import {
  MCCProcessStatus,
  ChatMessageLog,
  PlayerPosition,
  WSMessageFromServer,
  WSMessageFromClient,
  AccountProfile,
  AccountSummary,
  CommandShortcut,
} from '../types.js';
import { fixAndSanitizeIniContent } from '../lib/iniHelper.js';
import { renderMapPaletteToPngBuffer, updateCurrentCaptchaPngBuffer } from './mapRenderer.js';

const ansiConverter = new Convert({
  fg: '#e2e8f0',
  bg: '#0f172a',
  newline: true,
  escapeXML: true,
  stream: false,
});

interface AccountInstance {
  profile: AccountProfile;
  iniPath: string;
  mccProcess: ChildProcess | null;
  startTime: number;
  logs: ChatMessageLog[];
  logSeq: number;
  position: PlayerPosition;
  stoppedByUser: boolean;
  retryCount: number;
  retryTimer: NodeJS.Timeout | null;
  positionTimer: NodeJS.Timeout | null;
}

/**
 * Backoff delays (ms) for auto-relaunch after a quick login failure (EOF / rate-limit drop).
 * AquaMC rate-limits logins per IP (~60s window, kick: "You are logging in too fast").
 * Retrying at 8s just re-hits the still-active rate limit, so we wait 60s/2m/5m instead.
 */
const RELAUNCH_BACKOFFS = [60000, 120000, 300000];
const QUICK_EXIT_THRESHOLD_MS = 45000;
/** How often to auto-scan the bot's live position via `/position` (ms). */
const POSITION_SCAN_INTERVAL_MS = 5000;

/** Default shortcuts shown for every bot until the user customizes them */
const DEFAULT_GLOBAL_SHORTCUTS: CommandShortcut[] = [
  { id: 'default-help', label: '/help', command: '/help' },
  { id: 'default-inventory', label: '/inventory', command: '/inventory' },
  { id: 'default-tab', label: '/tab', command: '/tab' },
  { id: 'default-smp', label: '/server smp', command: '/server smp' },
  { id: 'default-reconnect', label: '/reconnect', command: '/reconnect' },
  { id: 'default-quit', label: '/quit', command: '/quit' },
];

export class MCCManager {
  private instances: Map<string, AccountInstance> = new Map();
  private clientState: Map<WebSocket, { activeAccountId: string }> = new Map();
  private maxLogs = 1000;
  private binaryPath = pathModule.join(process.cwd(), 'MinecraftClient');
  private botsDir = pathModule.join(process.cwd(), 'bots');
  private scriptsDir = pathModule.join(process.cwd(), 'scripts');
  private shortcutsFile = pathModule.join(process.cwd(), 'bots', 'shortcuts.json');
  private activeAccountId: string = '';
  private globalShortcuts: CommandShortcut[] = [];
  private localShortcuts: Map<string, CommandShortcut[]> = new Map();
  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.init();
  }

  /** Resolves once accounts + bots are fully loaded (fixes startup race with WS/REST clients) */
  public async ready(): Promise<void> {
    await this.readyPromise;
  }

  private async init() {
    await this.ensureBinaryAndIni();
    await this.loadAccounts();
    await this.loadShortcuts();
  }

  // ---------- Command shortcuts (global = all bots, local = per-account) ----------

  private async loadShortcuts() {
    try {
      const raw = await fsPromises.readFile(this.shortcutsFile, 'utf-8');
      const data = JSON.parse(raw);
      this.globalShortcuts = Array.isArray(data.global) && data.global.length > 0 ? data.global : [...DEFAULT_GLOBAL_SHORTCUTS];
      this.localShortcuts = new Map();
      if (data.local && typeof data.local === 'object') {
        for (const [id, list] of Object.entries(data.local)) {
          if (Array.isArray(list)) this.localShortcuts.set(id, list as CommandShortcut[]);
        }
      }
    } catch {
      this.globalShortcuts = [...DEFAULT_GLOBAL_SHORTCUTS];
      this.localShortcuts = new Map();
      await this.saveShortcuts();
    }
  }

  private async saveShortcuts() {
    const data: { global: CommandShortcut[]; local: Record<string, CommandShortcut[]> } = {
      global: this.globalShortcuts,
      local: {},
    };
    for (const [id, list] of this.localShortcuts) data.local[id] = list;
    await fsPromises.writeFile(this.shortcutsFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  public getShortcutsFor(accountId?: string): { global: CommandShortcut[]; local: CommandShortcut[] } {
    const targetId = accountId || this.activeAccountId;
    return {
      global: this.globalShortcuts,
      local: targetId ? this.localShortcuts.get(targetId) || [] : [],
    };
  }

  private broadcastShortcuts(accountId?: string) {
    const targetId = accountId || this.activeAccountId;
    this.broadcast(
      {
        type: 'SHORTCUTS_LIST',
        global: this.globalShortcuts,
        local: this.localShortcuts.get(targetId) || [],
        accountId: targetId,
      },
      targetId
    );
  }

  public sendShortcutsToClient(ws: WebSocket, accountId?: string) {
    if (ws.readyState !== WebSocket.OPEN) return;
    const targetId = accountId || this.activeAccountId;
    ws.send(
      JSON.stringify({
        type: 'SHORTCUTS_LIST',
        global: this.globalShortcuts,
        local: this.localShortcuts.get(targetId) || [],
        accountId: targetId,
      })
    );
  }

  public async addShortcut(scope: 'global' | 'local', label: string, command: string, accountId?: string): Promise<boolean> {
    if (!label.trim() || !command.trim()) return false;
    const shortcut: CommandShortcut = {
      id: `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: label.trim(),
      command: command.trim(),
    };
    if (scope === 'global') {
      this.globalShortcuts.push(shortcut);
    } else {
      const targetId = accountId || this.activeAccountId;
      const list = this.localShortcuts.get(targetId) || [];
      list.push(shortcut);
      this.localShortcuts.set(targetId, list);
    }
    await this.saveShortcuts();
    this.broadcastShortcuts(accountId);
    return true;
  }

  public async deleteShortcut(scope: 'global' | 'local', shortcutId: string, accountId?: string): Promise<boolean> {
    if (scope === 'global') {
      this.globalShortcuts = this.globalShortcuts.filter((s) => s.id !== shortcutId);
    } else {
      const targetId = accountId || this.activeAccountId;
      const list = (this.localShortcuts.get(targetId) || []).filter((s) => s.id !== shortcutId);
      this.localShortcuts.set(targetId, list);
    }
    await this.saveShortcuts();
    this.broadcastShortcuts(accountId);
    return true;
  }

  private async ensureBinaryAndIni() {
    // 1. Ensure matches.ini exists
    const matchesPath = pathModule.join(process.cwd(), 'matches.ini');
    try {
      await fsPromises.access(matchesPath);
    } catch {
      await fsPromises.writeFile(matchesPath, '[AutoRespond]\n', 'utf-8');
    }

    // 2. Ensure bots/ directory exists
    try {
      await fsPromises.access(this.botsDir);
    } catch {
      await fsPromises.mkdir(this.botsDir, { recursive: true });
    }

    // 3. Ensure template.ini exists (copy from root MinecraftClient.ini if missing)
    const templatePath = pathModule.join(this.botsDir, 'template.ini');
    try {
      await fsPromises.access(templatePath);
    } catch {
      try {
        const base = await fsPromises.readFile(pathModule.join(process.cwd(), 'MinecraftClient.ini'), 'utf-8');
        await fsPromises.writeFile(templatePath, base, 'utf-8');
      } catch {
        await fsPromises.writeFile(
          templatePath,
          '[Main.General]\nAccount = { Login = "geasf", Password = "-" }\nServer = { Host = "localhost", Port = 25565 }\n',
          'utf-8'
        );
      }
    }

    // 4. Ensure MinecraftClient binary exists
    try {
      await fsPromises.access(this.binaryPath);
    } catch {
      console.log('[MCC Manager] MinecraftClient binary not found. Downloading...');
      await this.downloadMCCBinary();
    }
  }

  private async downloadMCCBinary() {
    try {
      const url =
        'https://github.com/MCCTeam/Minecraft-Console-Client/releases/download/20260727-498/MinecraftClient-20260727-498-linux-x64';
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const tmpPath = `${this.binaryPath}.tmp`;
      await fsPromises.writeFile(tmpPath, buffer);
      await fsPromises.chmod(tmpPath, 0o755);
      await fsPromises.rename(tmpPath, this.binaryPath);
      console.log('✅ Successfully downloaded MinecraftClient executable!');
    } catch (err: any) {
      console.error(`Failed to download MinecraftClient binary: ${err.message}`);
    }
  }

  /** Sanitize a bot name to a safe folder name */
  public sanitizeBotId(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || `bot-${Date.now()}`;
  }

  /** Find a unique folder id (avoid collisions with existing bot folders) */
  private uniqueBotId(name: string): string {
    const base = this.sanitizeBotId(name);
    let id = base;
    let counter = 2;
    while (this.instances.has(id) || (fs.existsSync(pathModule.join(this.botsDir, id)) && id !== base)) {
      id = `${base}-${counter++}`;
    }
    return id;
  }

  private botDir(id: string): string {
    return pathModule.join(this.botsDir, id);
  }

  private async loadAccounts() {
    let savedProfiles: AccountProfile[] = [];

    try {
      const entries = await fsPromises.readdir(this.botsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const botJsonPath = pathModule.join(this.botDir(entry.name), 'bot.json');
        try {
          const raw = await fsPromises.readFile(botJsonPath, 'utf-8');
          const profile = JSON.parse(raw);
          if (profile && profile.id && profile.username) {
            savedProfiles.push(profile);
          }
        } catch {
          // No bot.json or invalid -> skip
        }
      }
    } catch (e) {
      console.error('Failed to scan bots directory:', e);
    }

    // No default account creation anymore - if empty, GUI shows empty state
    for (const prof of savedProfiles) {
      const iniPath = pathModule.join(this.botDir(prof.id), 'bot.ini');

      // Ensure bot.ini exists (copy from template if missing - e.g. bot created manually via createbot.py)
      if (!fs.existsSync(iniPath)) {
        try {
          const template = await fsPromises.readFile(pathModule.join(this.botsDir, 'template.ini'), 'utf-8');
          await fsPromises.writeFile(iniPath, template, 'utf-8');
          this.syncProfileToIni(iniPath, prof);
        } catch {
          // ignore
        }
      }

      this.instances.set(prof.id, {
        profile: prof,
        iniPath,
        mccProcess: null,
        startTime: 0,
        logs: [],
        logSeq: 0,
        position: { x: 100, y: 64, z: 200, yaw: 180, pitch: 0 },
        stoppedByUser: false,
        retryCount: 0,
        retryTimer: null,
        positionTimer: null,
      });

      // Regenerate run.sh so manually-created bots stay in sync
      this.generateRunSh(this.instances.get(prof.id)!);
    }

    if (!this.instances.has(this.activeAccountId)) {
      this.activeAccountId = Array.from(this.instances.keys())[0] || '';
    }
  }

  private saveAccountsToDisk(profiles: AccountProfile[]) {
    for (const prof of profiles) {
      try {
        const botDir = this.botDir(prof.id);
        fs.mkdirSync(botDir, { recursive: true });
        fs.writeFileSync(pathModule.join(botDir, 'bot.json'), JSON.stringify(prof, null, 2), 'utf-8');
      } catch (e) {
        console.error(`Failed to write bot.json for ${prof.id}:`, e);
      }
    }
  }

  /** Generate a run.sh for a bot (manual launch outside web UI) */
  private generateRunSh(inst: AccountInstance) {
    try {
      const botDir = this.botDir(inst.profile.id);
      const scriptArg = inst.profile.script
        ? ` script="${pathModule.join(this.scriptsDir, inst.profile.script)}"`
        : '';
      const port = inst.profile.serverPort || 25565;
      const serverArg = port === 25565 ? inst.profile.serverHost : `${inst.profile.serverHost}:${port}`;
      const sh = `#!/bin/bash
# Auto-generated launcher for bot: ${inst.profile.name}
# Account: ${inst.profile.username} @ ${inst.profile.serverHost}:${inst.profile.serverPort}
cd "$(dirname "$0")/../.."
./MinecraftClient "${inst.profile.username}" "${inst.profile.password || '-'}" "${serverArg}"${scriptArg}
`;
      const shPath = pathModule.join(botDir, 'run.sh');
      fs.writeFileSync(shPath, sh, 'utf-8');
      fs.chmodSync(shPath, 0o755);
    } catch (e) {
      console.error(`Failed to generate run.sh for ${inst.profile.id}:`, e);
    }
  }

  /** Escape backslashes + quotes so INI values never break the config parser */
  private iniSafe(value: string): string {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  /** Resolve a friendly account type (offline/mojang/...) to MCC ini values */
  private resolveCredentials(accountType: string, password?: string): { accountType: string; password: string } {
    if (accountType === 'offline') {
      return { accountType: 'mojang', password: '-' };
    }
    const pass = password !== undefined && password.trim() !== '' ? password.trim() : '-';
    return { accountType: accountType || 'mojang', password: pass };
  }

  /** Insert a key line into a specific INI section (creating the section if missing).
      Appending at the end of the file would place the key in whatever the last section is,
      which MCC would parse as part of that section and ignore. */
  private insertIntoSection(raw: string, sectionName: string, line: string): string {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headerRe = new RegExp(`^(\\s*\\[${escaped}\\]\\s*)$`, 'm');
    if (headerRe.test(raw)) {
      return raw.replace(headerRe, `$1\n${line}`);
    }
    return `${raw.replace(/\n*$/, '')}\n\n[${sectionName}]\n${line}\n`;
  }

  private syncProfileToIni(iniPath: string, prof: Partial<AccountProfile>) {
    try {
      let raw = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, 'utf-8') : '';
      const creds = this.resolveCredentials(prof.accountType || 'mojang', prof.password);

      if (prof.serverHost) {
        const port = prof.serverPort || 25565;
        if (/Server\s*=\s*\{[^}]*\}/.test(raw)) {
          raw = raw.replace(/Server\s*=\s*\{[^}]*\}/, `Server = { Host = "${this.iniSafe(prof.serverHost)}", Port = ${port} }`);
        } else {
          raw = this.insertIntoSection(raw, 'Main.General', `Server = { Host = "${this.iniSafe(prof.serverHost)}", Port = ${port} }`);
        }
      }

      if (prof.username) {
        if (/Account\s*=\s*\{[^}]*\}/.test(raw)) {
          raw = raw.replace(/Account\s*=\s*\{[^}]*\}/, `Account = { Login = "${this.iniSafe(prof.username)}", Password = "${creds.password}" }`);
        } else {
          raw = this.insertIntoSection(raw, 'Main.General', `Account = { Login = "${this.iniSafe(prof.username)}", Password = "${creds.password}" }`);
        }
      }

      if (creds.accountType) {
        if (/^(\s*AccountType\s*=\s*)"[^"]*"/m.test(raw)) {
          raw = raw.replace(/^(\s*AccountType\s*=\s*)"[^"]*"/m, `$1"${creds.accountType}"`);
        } else {
          raw = this.insertIntoSection(raw, 'Main.General', `AccountType = "${creds.accountType}"`);
        }
      }

      if (prof.minecraftVersion) {
        if (/^(\s*MinecraftVersion\s*=\s*)"[^"]*"/m.test(raw)) {
          raw = raw.replace(/^(\s*MinecraftVersion\s*=\s*)"[^"]*"/m, `$1"${prof.minecraftVersion}"`);
        } else {
          raw = this.insertIntoSection(raw, 'Main.Advanced', `MinecraftVersion = "${prof.minecraftVersion}"`);
        }
      }

      const repair = fixAndSanitizeIniContent(raw);
      fs.writeFileSync(iniPath, repair.repairedIni, 'utf-8');
    } catch (e) {
      console.error(`Failed to sync profile to INI ${iniPath}:`, e);
    }
  }

  private parseIniToStatus(iniPath: string): {
    serverHost: string;
    serverPort: number;
    username: string;
    accountType: string;
    minecraftVersion: string;
  } {
    let raw = '';
    try {
      raw = fs.readFileSync(iniPath, 'utf-8');
    } catch {}

    let serverHost = 'localhost';
    let serverPort = 25565;
    let username = 'unknown';
    let accountType = 'mojang';
    let minecraftVersion = 'auto';

    if (raw) {
      const hostMatch = raw.match(/Host\s*=\s*"([^"]+)"/i) || raw.match(/Server\s*=\s*\{[^}]*Host\s*=\s*"([^"]+)"/i);
      if (hostMatch) serverHost = hostMatch[1];

      const portMatch = raw.match(/Port\s*=\s*(\d+)/i) || raw.match(/Server\s*=\s*\{[^}]*Port\s*=\s*(\d+)/i);
      if (portMatch) serverPort = parseInt(portMatch[1], 10);

      const userMatch = raw.match(/Login\s*=\s*"([^"]+)"/i) || raw.match(/Account\s*=\s*\{[^}]*Login\s*=\s*"([^"]+)"/i);
      if (userMatch) username = userMatch[1];

      const accTypeMatch = raw.match(/AccountType\s*=\s*"([^"]+)"/i);
      if (accTypeMatch) accountType = accTypeMatch[1];

      const mcVerMatch = raw.match(/MinecraftVersion\s*=\s*"([^"]+)"/i);
      if (mcVerMatch) minecraftVersion = mcVerMatch[1];
    }

    return { serverHost, serverPort, username, accountType, minecraftVersion };
  }

  public getAccountsSummaries(): AccountSummary[] {
    const list: AccountSummary[] = [];
    for (const [id, inst] of this.instances.entries()) {
      const status = this.getStatusForAccount(id);
      list.push({
        id,
        name: inst.profile.name,
        username: status.username,
        serverHost: status.serverHost,
        serverPort: status.serverPort,
        accountType: status.accountType,
        running: status.running,
        pid: status.pid,
        uptimeSeconds: status.uptimeSeconds,
        autoRelog: status.autoRelog,
      });
    }
    return list;
  }

  public addClient(ws: WebSocket) {
    this.clientState.set(ws, { activeAccountId: this.activeAccountId });
    this.sendFullStateToClient(ws, this.activeAccountId);

    ws.on('close', () => {
      this.clientState.delete(ws);
    });
  }

  private sendFullStateToClient(ws: WebSocket, accountId: string) {
    if (ws.readyState !== WebSocket.OPEN) return;

    // Send Accounts List
    ws.send(
      JSON.stringify({
        type: 'ACCOUNTS_LIST',
        accounts: this.getAccountsSummaries(),
        activeAccountId: accountId,
      })
    );

    if (!accountId || !this.instances.has(accountId)) return;

    // Send MCC Status
    ws.send(
      JSON.stringify({
        type: 'MCC_STATUS',
        status: this.getStatusForAccount(accountId),
        accountId,
      })
    );

    // Send Logs History
    const inst = this.instances.get(accountId);
    if (inst) {
      for (const log of inst.logs.slice(-150)) {
        ws.send(JSON.stringify({ type: 'LOG_MESSAGE', log, accountId }));
      }
      // Send Position Update
      ws.send(JSON.stringify({ type: 'POSITION_UPDATE', position: inst.position, accountId }));
    }

    // Send INI Content
    this.sendIniContentToClient(ws, accountId);

    // Send command shortcuts
    this.sendShortcutsToClient(ws, accountId);
  }

  public broadcast(msg: WSMessageFromServer, targetAccountId?: string) {
    const payload = JSON.stringify(msg);
    for (const [ws, state] of this.clientState.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        if (!targetAccountId || state.activeAccountId === targetAccountId) {
          ws.send(payload);
        }
      } else {
        this.clientState.delete(ws);
      }
    }
  }

  private addLog(accountId: string, type: ChatMessageLog['type'], text: string, rawAnsi?: string) {
    const inst = this.instances.get(accountId);
    if (!inst) return;

    let ansiHtml = '';
    if (rawAnsi) {
      try {
        ansiHtml = ansiConverter.toHtml(rawAnsi);
      } catch {
        ansiHtml = text;
      }
    }

    inst.logSeq++;
    const log: ChatMessageLog = {
      id: `log-${accountId}-${Date.now()}-${inst.logSeq}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      text,
      ansiHtml,
      type,
      accountId,
    };

    inst.logs.push(log);
    if (inst.logs.length > this.maxLogs) {
      inst.logs.shift();
    }

    this.broadcast({ type: 'LOG_MESSAGE', log, accountId }, accountId);
  }

  private parseAndBroadcastCoords(accountId: string, text: string) {
    const inst = this.instances.get(accountId);
    if (!inst) return;

    const r1 = /X:\s*(-?\d+(?:\.\d+)?)\s*,?\s*Y:\s*(-?\d+(?:\.\d+)?)\s*,?\s*Z:\s*(-?\d+(?:\.\d+)?)/i.exec(text);
    if (r1) {
      const x = parseFloat(r1[1]);
      const y = parseFloat(r1[2]);
      const z = parseFloat(r1[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        this.updatePositionAndBroadcast(inst, { x, y, z });
        return;
      }
    }

    const r2 = /(?:position|location|coords|at)\D*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(text);
    if (r2) {
      const x = parseFloat(r2[1]);
      const y = parseFloat(r2[2]);
      const z = parseFloat(r2[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        this.updatePositionAndBroadcast(inst, { x, y, z });
        return;
      }
    }
  }

  /** Update position and only broadcast to clients when the XYZ actually changed
      (avoids flooding the WS with identical coords from periodic /position scans). */
  private updatePositionAndBroadcast(inst: AccountInstance, pos: Partial<PlayerPosition>) {
    const prev = inst.position;
    const changed =
      (pos.x !== undefined && pos.x !== prev.x) ||
      (pos.y !== undefined && pos.y !== prev.y) ||
      (pos.z !== undefined && pos.z !== prev.z);
    if (!changed) return;
    const updated = { ...prev, ...pos };
    const prevKey = `${prev.x}|${prev.y}|${prev.z}`;
    const newKey = `${updated.x}|${updated.y}|${updated.z}`;
    if (prevKey === newKey) return;
    inst.position = updated;
    const accountId = inst.profile.id;
    this.broadcast({ type: 'POSITION_UPDATE', position: inst.position, accountId }, accountId);
  }

  public getStatusForAccount(accountId: string): MCCProcessStatus {
    const inst = this.instances.get(accountId);
    if (!inst) {
      return {
        accountId,
        running: false,
        pid: null,
        uptimeSeconds: 0,
        serverHost: 'localhost',
        serverPort: 25565,
        username: 'unknown',
        accountType: 'mojang',
        minecraftVersion: 'auto',
      };
    }

    const parsed = this.parseIniToStatus(inst.iniPath);
    return {
      accountId,
      running: !!inst.mccProcess && !inst.mccProcess.killed,
      pid: inst.mccProcess?.pid || null,
      uptimeSeconds: inst.startTime ? Math.floor((Date.now() - inst.startTime) / 1000) : 0,
      serverHost: inst.profile.serverHost || parsed.serverHost,
      serverPort: inst.profile.serverPort || parsed.serverPort,
      username: inst.profile.username || parsed.username,
      accountType: inst.profile.accountType || parsed.accountType,
      minecraftVersion: inst.profile.minecraftVersion || parsed.minecraftVersion,
      lastLog: inst.logs.length > 0 ? inst.logs[inst.logs.length - 1].text : undefined,
      autoRelog: this.readAutoRelogFromIni(inst.iniPath),
    };
  }

  /** Read AutoRelog enabled state from a bot's INI file */
  private readAutoRelogFromIni(iniPath: string): boolean {
    try {
      const raw = fs.readFileSync(iniPath, 'utf-8');
      const section = raw.match(/\[ChatBot\.AutoRelog\][^\[]*/i)?.[0] || '';
      if (!section) return false;
      const m = section.match(/^\s*Enabled\s*=\s*(true|false)/im);
      return m ? m[1].toLowerCase() === 'true' : false;
    } catch {
      return false;
    }
  }

  /** Set Enabled = true/false in an INI section. Works even when the section exists
      but has no Enabled line yet (previous regex replace silently did nothing then). */
  private setSectionEnabled(raw: string, sectionName: string, enabled: boolean): string {
    const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionRe = new RegExp(`\\[${escaped}\\][^\\[]*`, 'i');
    const sectionMatch = raw.match(sectionRe);
    if (!sectionMatch) {
      return `${raw.replace(/\n*$/, '')}\n\n[${sectionName}]\nEnabled = ${enabled}\n`;
    }
    const section = sectionMatch[0];
    // Only match the Enabled line itself (leading spaces/tabs, single line, no multi-line greed)
    const enabledRe = /([ \t]*)Enabled[ \t]*=[ \t]*(true|false)[ \t]*$/im;
    if (enabledRe.test(section)) {
      const newSection = section.replace(enabledRe, `$1Enabled = ${enabled}`);
      return raw.replace(section, newSection);
    }
    const insertAt = section.replace(/\n+$/, '');
    const newSection = insertAt + (insertAt === '' || insertAt.endsWith('\n') ? '' : '\n') + `Enabled = ${enabled}\n`;
    return raw.replace(section, newSection);
  }

  public async startMCC(accountId?: string, isAutoRelaunch = false) {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return;

    if (inst.mccProcess && !inst.mccProcess.killed) {
      this.addLog(targetId, 'system', `[MCC Manager] Bot "${inst.profile.name}" (${inst.profile.username}) is already running.`);
      return;
    }

    if (inst.retryTimer) {
      clearTimeout(inst.retryTimer);
      inst.retryTimer = null;
    }
    inst.stoppedByUser = false;
    if (!isAutoRelaunch) inst.retryCount = 0;

    await this.ensureBinaryAndIni();

    this.addLog(targetId, 'system', `🚀 Launching MCC for account: ${inst.profile.name} (${inst.profile.username} @ ${inst.profile.serverHost}:${inst.profile.serverPort})...`);
    try {
      // Spawn MCC with CLI-style args (username, password, server) like the
      // user's manual `./MinecraftClient <user> <pass> <server>` launches.
      // Launching with only an INI path + `script=` reproducibly dies during
      // login with `EndOfStreamException: Attempted to read past the end of
      // the stream`, so fall back to the direct-args form which connects fine.
      const port = inst.profile.serverPort || 25565;
      const password = inst.profile.password || '-';
      const serverArg = port === 25565 ? inst.profile.serverHost : `${inst.profile.serverHost}:${port}`;
      const args: string[] = [inst.profile.username, password, serverArg];
      if (inst.profile.script) {
        const scriptPath = pathModule.join(this.scriptsDir, inst.profile.script);
        try {
          await fsPromises.access(scriptPath);
          args.push(`script=${scriptPath}`);
          this.addLog(targetId, 'system', `📜 Đang chạy script login: ${inst.profile.script}`);
        } catch {
          this.addLog(targetId, 'system', `⚠️ Không tìm thấy script: ${inst.profile.script} (trong scripts/) - bỏ qua script`);
        }
      }

      inst.mccProcess = spawn(this.binaryPath, args, {
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' },
      });

      inst.startTime = Date.now();
      this.broadcastStatus(targetId);

      if (inst.mccProcess.stdout) {
        inst.mccProcess.stdout.on('data', (chunk: Buffer) => {
          const raw = chunk.toString('utf-8');
          const lines = raw.split(/\r?\n/);
          for (const line of lines) {
            if (!line.trim()) continue;
            const cleanText = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
            this.addLog(targetId, 'mcc', cleanText, line);
            this.parseAndBroadcastCoords(targetId, cleanText);
          }
        });
      }

      if (inst.mccProcess.stderr) {
        inst.mccProcess.stderr.on('data', (chunk: Buffer) => {
          const line = chunk.toString('utf-8').trim();
          if (line) {
            this.addLog(targetId, 'error', `[stderr] ${line}`, line);
          }
        });
      }

      if (!inst.positionTimer) {
        inst.positionTimer = setInterval(() => {
          const cur = this.instances.get(targetId);
          if (!cur || !cur.mccProcess || cur.mccProcess.killed || !cur.mccProcess.stdin || cur.mccProcess.stdin.destroyed) {
            return;
          }
          cur.mccProcess.stdin.write('/position\n');
        }, POSITION_SCAN_INTERVAL_MS);
      }

      inst.mccProcess.on('exit', (code, signal) => {
        const uptimeMs = inst.startTime ? Date.now() - inst.startTime : 0;
        if (inst.positionTimer) {
          clearInterval(inst.positionTimer);
          inst.positionTimer = null;
        }
        this.addLog(targetId, 'kicked', `[MCC Process Exited] Exit Code: ${code ?? 'N/A'}, Signal: ${signal ?? 'N/A'}, Uptime: ${Math.floor(uptimeMs / 1000)}s`);
        inst.mccProcess = null;
        inst.startTime = 0;
        this.broadcastStatus(targetId);

        // Auto-relaunch ONLY when AutoRelog is explicitly ON for the bot.
        // 1) Quick exits (< 45s) = login failures / rate-limits / EOF (AquaMC rate-limits
        //    logins per IP -> EndOfStreamException / "logging in too fast").
        //    Retrying at 8s just re-hits the still-active rate limit, so wait 60s/2m/5m.
        // 2) Kicks after a long uptime = normal kicks/restarts. Reset the rate-limit
        //    counter and relaunch after a fixed 30s delay so the AFK bot comes back.
        // If AutoRelog is OFF, a kick stops the bot for good until the user re-starts it.
        const autoRelogOn = this.readAutoRelogFromIni(inst.iniPath);
        if (!inst.stoppedByUser && autoRelogOn) {
          if (uptimeMs < QUICK_EXIT_THRESHOLD_MS) {
            // Rate-limit / EOF drops during login. Backoff, but NEVER give up:
            // after the last scheduled backoff, keep retrying forever at the max delay.
            const delayMs = inst.retryCount < RELAUNCH_BACKOFFS.length
              ? RELAUNCH_BACKOFFS[inst.retryCount]
              : RELAUNCH_BACKOFFS[RELAUNCH_BACKOFFS.length - 1];
            inst.retryCount += 1;
            this.addLog(
              targetId,
              'system',
              `🔄 Server drop kết nối khi login (rate-limit/EOF). Tự động kết nối lại lần ${inst.retryCount} sau ${Math.round(delayMs / 1000)}s...`
            );
            inst.retryTimer = setTimeout(() => {
              inst.retryTimer = null;
              this.startMCC(targetId, true);
            }, delayMs);
          } else {
            inst.retryCount = 0;
            const delayMs = 30000;
            this.addLog(
              targetId,
              'system',
              `🔄 Bot bị kick sau ${Math.floor(uptimeMs / 1000)}s online. Tự động kết nối lại sau ${Math.round(delayMs / 1000)}s...`
            );
            inst.retryTimer = setTimeout(() => {
              inst.retryTimer = null;
              this.startMCC(targetId, true);
            }, delayMs);
          }
        } else if (!inst.stoppedByUser) {
          inst.retryCount = 0;
          const reason = uptimeMs < QUICK_EXIT_THRESHOLD_MS
            ? `Server từ chối/ngắt lúc login (rate-limit/EOF)`
            : `Bot bị kick sau ${Math.floor(uptimeMs / 1000)}s online`;
          this.addLog(
            targetId,
            'system',
            `⛔ ${reason}. AutoRelog đang TẮT nên bot đã DỪNG HẲN. Bật AutoRelog để tự động reconnect, hoặc bấm Start để chạy lại.`
          );
        }
      });

      inst.mccProcess.on('error', (err) => {
        this.addLog(targetId, 'error', `[MCC Process Error] ${err.message}`);
        inst.mccProcess = null;
        inst.startTime = 0;
        this.broadcastStatus(targetId);
      });
    } catch (err: any) {
      this.addLog(targetId, 'error', `Failed to start MCC process: ${err.message}`);
    }
  }

  public async stopMCC(accountId?: string): Promise<void> {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return;
    // Stop even when no live process: cancel a pending auto-relaunch so the
    // bot stays down (otherwise a retryTimer firing would bring it back up).
    inst.stoppedByUser = true;
    if (inst.retryTimer) {
      clearTimeout(inst.retryTimer);
      inst.retryTimer = null;
    }
    if (!inst.mccProcess || inst.mccProcess.killed) {
      inst.mccProcess = null;
      inst.startTime = 0;
      if (inst.positionTimer) {
        clearInterval(inst.positionTimer);
        inst.positionTimer = null;
      }
      this.broadcastStatus(targetId);
      this.addLog(targetId, 'system', `[MCC Manager] No active process to stop for account ${targetId} — auto-relaunch cancelled.`);
      return;
    }

    this.addLog(targetId, 'system', `⏹️ Stopping Minecraft Console Client for account ${inst.profile.name}...`);

    return new Promise<void>((resolve) => {
      let resolved = false;
      const cleanupAndResolve = () => {
        if (!resolved) {
          resolved = true;
          inst.mccProcess = null;
          inst.startTime = 0;
          if (inst.positionTimer) {
            clearInterval(inst.positionTimer);
            inst.positionTimer = null;
          }
          this.broadcastStatus(targetId);
          resolve();
        }
      };

      const proc = inst.mccProcess;
      if (!proc) return cleanupAndResolve();

      proc.once('exit', cleanupAndResolve);
      proc.once('close', cleanupAndResolve);

      try {
        if (proc.stdin && !proc.stdin.destroyed) {
          proc.stdin.write('/quit\n');
        }
      } catch (e) {}

      setTimeout(() => {
        try {
          if (proc && !proc.killed) {
            proc.kill('SIGKILL');
          }
        } catch (e) {}
        cleanupAndResolve();
      }, 1500);
    });
  }

  public async restartMCC(accountId?: string) {
    const targetId = accountId || this.activeAccountId;
    await this.stopMCC(targetId);
    await new Promise((r) => setTimeout(r, 500));
    await this.startMCC(targetId);
  }

  /**
   * Stop MCC (if running), wait for its on-exit INI rewrite, then write our INI
   * content and start MCC again. MCC rewrites bot.ini from its in-memory config
   * when it exits, so writing the INI before the stop gets clobbered.
   */
  public async stopThenSaveIniAndRestart(targetId: string, raw: string) {
    const inst = this.instances.get(targetId);
    const wasRunning = inst && inst.mccProcess && !inst.mccProcess.killed;
    if (wasRunning) {
      this.addLog(targetId, 'system', '⏳ Khởi động lại MCC để áp dụng cài đặt mới...');
      await this.stopMCC(targetId);
      await new Promise((r) => setTimeout(r, 1500));
    }
    await this.saveIniContent(raw, targetId);
    if (wasRunning) {
      await this.startMCC(targetId);
    }
  }

  public sendCommand(cmd: string, accountId?: string) {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst || !inst.mccProcess || !inst.mccProcess.stdin || inst.mccProcess.killed) {
      this.addLog(targetId, 'error', `Cannot send command "${cmd}": MCC for account "${inst?.profile.name || targetId}" is not running.`);
      return;
    }

    this.addLog(targetId, 'action', `> ${cmd}`);
    inst.mccProcess.stdin.write(cmd + '\n');
  }

  // ---------- Bulk / dashboard actions (multi-bot, staggered) ----------

  /**
   * Send the same command to several bots, one by one, with `staggerMs`
   * between each send so the server never sees "logging in too fast".
   */
  public broadcastCommand(accountIds: string[], command: string, staggerMs = 5000) {
    const ids = accountIds.filter((id) => this.instances.has(id));
    ids.forEach((accountId, i) => {
      const delay = i * Math.max(0, staggerMs);
      setTimeout(() => {
        this.sendCommand(command, accountId);
        this.addLog(accountId, 'system', `📡 Nhận lệnh từ Dashboard (bot thứ ${i + 1}/${ids.length}): "${command}"`);
      }, delay);
    });
    this.addLog(ids[0] || '', 'system', `📤 Đã gửi lệnh "${command}" cho ${ids.length} bot, giãn cách ${staggerMs / 1000}s giữa các bot.`);
  }

  /** Start several bots, staggered so logins don't hit the rate limit at once. */
  public broadcastStart(accountIds: string[], staggerMs = 5000) {
    const ids = accountIds.filter((id) => this.instances.has(id));
    ids.forEach((accountId, i) => {
      const delay = i * Math.max(0, staggerMs);
      setTimeout(() => this.startMCC(accountId), delay);
    });
    this.addLog(ids[0] || '', 'system', `🚀 Đang start ${ids.length} bot, mỗi bot cách nhau ${staggerMs / 1000}s...`);
  }

  /** Stop several bots at once. */
  public broadcastStop(accountIds: string[]) {
    const ids = accountIds.filter((id) => this.instances.has(id));
    ids.forEach((accountId) => this.stopMCC(accountId));
    this.addLog(ids[0] || '', 'system', `⏹️ Đã yêu cầu dừng ${ids.length} bot.`);
  }

  /** Get a compact snapshot of every bot for the dashboard table. */
  public getDashboardSummary() {
    const accounts = this.getAccountsSummaries();
    const statuses = new Map<string, MCCProcessStatus>();
    for (const id of this.instances.keys()) {
      statuses.set(id, this.getStatusForAccount(id));
    }
    return {
      total: accounts.length,
      running: accounts.filter((a) => a.running).length,
      stopped: accounts.filter((a) => !a.running).length,
      accounts: accounts.map((acc) => ({
        ...acc,
        status: statuses.get(acc.id),
      })),
    };
  }

  public async getIniContent(accountId?: string): Promise<string> {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return '';
    try {
      return await fsPromises.readFile(inst.iniPath, 'utf-8');
    } catch {
      return '';
    }
  }

  public async saveIniContent(content: string, accountId?: string): Promise<boolean> {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return false;

    try {
      const repair = fixAndSanitizeIniContent(content);
      const contentToSave = repair.repairedIni;

      await fsPromises.writeFile(inst.iniPath, contentToSave, 'utf-8');
      if (repair.fixCount > 0) {
        this.addLog(targetId, 'system', `💾 Đã lưu ${pathModule.basename(inst.iniPath)}! Tự động sửa ${repair.fixCount} lỗi cú pháp.`);
      } else {
        this.addLog(targetId, 'system', `💾 Đã lưu ${pathModule.basename(inst.iniPath)} thành công!`);
      }

      // Re-sync profile from INI
      const parsed = this.parseIniToStatus(inst.iniPath);
      inst.profile.serverHost = parsed.serverHost;
      inst.profile.serverPort = parsed.serverPort;
      inst.profile.username = parsed.username;
      inst.profile.accountType = parsed.accountType;
      inst.profile.minecraftVersion = parsed.minecraftVersion;
      this.saveAccountsToDisk(Array.from(this.instances.values()).map((i) => i.profile));

      this.broadcastIniContent(targetId);
      this.broadcastStatus(targetId);
      this.broadcastAccountsList();
      return true;
    } catch (err: any) {
      this.addLog(targetId, 'error', `Failed to save INI: ${err.message}`);
      return false;
    }
  }

  public async autoFixIni(accountId?: string): Promise<boolean> {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return false;

    try {
      const currentIni = await this.getIniContent(targetId);
      const repair = fixAndSanitizeIniContent(currentIni);

      if (repair.fixCount > 0) {
        await this.stopThenSaveIniAndRestart(targetId, repair.repairedIni);
        this.addLog(targetId, 'system', `✅ [Sửa Lỗi INI] Đã khắc phục thành công ${repair.fixCount} lỗi cú pháp.`);
      } else {
        this.addLog(targetId, 'system', `✅ File configuration đã chuẩn 100%, không phát hiện lỗi cú pháp!`);
      }

      this.broadcastIniContent(targetId);
      this.broadcastStatus(targetId);
      return true;
    } catch (err: any) {
      this.addLog(targetId, 'error', `Không thể tự động sửa file INI: ${err.message}`);
      return false;
    }
  }

  public async updateServerAccount(
    host: string,
    port: number = 25565,
    username: string,
    password?: string,
    accountType: string = 'mojang',
    method: string = 'mcc',
    minecraftVersion?: string,
    accountId?: string
  ) {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return;

    const creds = this.resolveCredentials(accountType, password);

    inst.profile.serverHost = host;
    inst.profile.serverPort = port;
    inst.profile.username = username;
    if (password !== undefined || accountType === 'offline') inst.profile.password = creds.password;
    inst.profile.accountType = creds.accountType;
    if (minecraftVersion) inst.profile.minecraftVersion = minecraftVersion;

    this.saveAccountsToDisk(Array.from(this.instances.values()).map((i) => i.profile));
    this.syncProfileToIni(inst.iniPath, inst.profile);
    this.generateRunSh(inst);

    this.broadcastIniContent(targetId);
    this.broadcastStatus(targetId);
    this.broadcastAccountsList();
  }

  public async addAccount(profileData: Omit<AccountProfile, 'id'>) {
    const id = this.uniqueBotId(profileData.name || profileData.username);
    const creds = this.resolveCredentials(profileData.accountType || 'mojang', profileData.password);
    const newProfile: AccountProfile = {
      ...profileData,
      id,
      password: creds.password,
      accountType: creds.accountType,
      serverPort: profileData.serverPort || 25565,
      minecraftVersion: profileData.minecraftVersion || 'auto',
    };

    const botDir = this.botDir(id);
    fs.mkdirSync(botDir, { recursive: true });

    // Copy template.ini as the bot's own config
    const templatePath = pathModule.join(this.botsDir, 'template.ini');
    const iniPath = pathModule.join(botDir, 'bot.ini');
    let baseIni = '';
    try {
      baseIni = fs.readFileSync(templatePath, 'utf-8');
    } catch {
      baseIni = '[Main.General]\nAccount = { Login = "geasf", Password = "-" }\nServer = { Host = "localhost", Port = 25565 }\n';
    }
    fs.writeFileSync(iniPath, baseIni, 'utf-8');
    this.syncProfileToIni(iniPath, newProfile);

    const inst: AccountInstance = {
      profile: newProfile,
      iniPath,
      mccProcess: null,
      startTime: 0,
      logs: [],
      logSeq: 0,
      position: { x: 100, y: 64, z: 200, yaw: 180, pitch: 0 },
      stoppedByUser: false,
      retryCount: 0,
      retryTimer: null,
      positionTimer: null,
    };
    this.instances.set(id, inst);
    this.generateRunSh(inst);

    this.saveAccountsToDisk(Array.from(this.instances.values()).map((i) => i.profile));
    this.addLog(id, 'system', `➕ Đã khởi tạo bot mới: ${newProfile.name} (${newProfile.username} @ ${newProfile.serverHost}:${newProfile.serverPort})`);

    this.broadcastAccountsList();
    return id;
  }

  public async deleteAccount(accountId: string) {
    const inst = this.instances.get(accountId);
    if (!inst) return false;

    // Stop process if running
    if (inst.mccProcess) {
      await this.stopMCC(accountId);
    }

    // Cancel any pending auto-relaunch timer
    if (inst.retryTimer) {
      clearTimeout(inst.retryTimer);
      inst.retryTimer = null;
    }

    // Remove the entire bot folder (bots/<name>/)
    try {
      const botDir = this.botDir(accountId);
      if (fs.existsSync(botDir)) {
        fs.rmSync(botDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error(`Failed to delete bot folder for ${accountId}:`, e);
    }

    this.instances.delete(accountId);

    // No auto-recreate of default account - empty state if no bots left
    const nextActiveId = Array.from(this.instances.keys())[0] || '';
    this.activeAccountId = nextActiveId;

    this.saveAccountsToDisk(Array.from(this.instances.values()).map((i) => i.profile));

    // Notify & sync state for all clients that were targeting this deleted account
    for (const [ws, state] of this.clientState.entries()) {
      if (state.activeAccountId === accountId) {
        state.activeAccountId = nextActiveId;
        this.sendFullStateToClient(ws, nextActiveId);
      }
    }

    this.broadcastAccountsList();
    return true;
  }

  public async setAutoRelog(enabled: boolean, accountId?: string): Promise<boolean> {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return false;

    try {
      let raw = await this.getIniContent(targetId);
      raw = this.setSectionEnabled(raw, 'ChatBot.AutoRelog', enabled);

      this.addLog(targetId, 'system', enabled ? '🔄 Auto Relog (tự động kết nối lại) ĐÃ BẬT.' : '🚫 Auto Relog (tự động kết nối lại) ĐÃ TẮT.');

      // Stop MCC first, then write the INI: MCC rewrites bot.ini from its
      // in-memory config when it exits and would clobber our change otherwise.
      await this.stopThenSaveIniAndRestart(targetId, raw);

      this.broadcastIniContent(targetId);
      return true;
    } catch (err: any) {
      this.addLog(targetId, 'error', `Lỗi khi đổi Auto Relog: ${err.message}`);
      return false;
    }
  }

  public async enableSilentMode(accountId?: string): Promise<boolean> {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return false;

    try {
      let raw = await this.getIniContent(targetId);

      raw = this.setSectionEnabled(raw, 'ChatBot.AutoRelog', false);
      raw = this.setSectionEnabled(raw, 'ChatBot.ScriptScheduler', false);
      raw = this.setSectionEnabled(raw, 'ChatBot.AutoRespond', false);

      if (/\[ChatBot\.AutoEat\][^\[]*/.test(raw)) {
        raw = this.setSectionEnabled(raw, 'ChatBot.AutoEat', false);
      }

      if (raw.includes('ConsoleColorMode')) {
        raw = raw.replace(/ConsoleColorMode\s*=\s*".*?"/g, 'ConsoleColorMode = "vt100_24bit"');
      } else {
        raw += '\n[Console.General]\nConsoleColorMode = "vt100_24bit"\n';
      }

      await this.stopThenSaveIniAndRestart(targetId, raw);
      this.addLog(targetId, 'system', '🔇 Chế độ Im Lặng (Silent Anti-Kick) đã bật cho tài khoản này!');
      return true;
    } catch (err: any) {
      this.addLog(targetId, 'error', `Lỗi khi bật Chế Độ Im Lặng: ${err.message}`);
      return false;
    }
  }

  public async sendIniContentToClient(ws: WebSocket, accountId?: string) {
    const targetId = accountId || this.activeAccountId;
    const content = await this.getIniContent(targetId);
    const parsed = ini.parse(content);
    ws.send(JSON.stringify({ type: 'INI_CONTENT', content, parsed, accountId: targetId }));
  }

  public async broadcastIniContent(accountId?: string) {
    const targetId = accountId || this.activeAccountId;
    const content = await this.getIniContent(targetId);
    const parsed = ini.parse(content);
    this.broadcast({ type: 'INI_CONTENT', content, parsed, accountId: targetId }, targetId);
  }

  public broadcastStatus(accountId?: string) {
    const targetId = accountId || this.activeAccountId;
    this.broadcast({ type: 'MCC_STATUS', status: this.getStatusForAccount(targetId), accountId: targetId });
  }

  public broadcastAccountsList() {
    for (const [ws, state] of this.clientState.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'ACCOUNTS_LIST',
            accounts: this.getAccountsSummaries(),
            activeAccountId: state.activeAccountId,
          })
        );
      }
    }
  }

  public selectAccountForClient(ws: WebSocket, accountId: string) {
    if (!this.instances.has(accountId)) return;
    this.clientState.set(ws, { activeAccountId: accountId });
    this.sendFullStateToClient(ws, accountId);
  }

  public handleClientMessage(ws: WebSocket, msg: WSMessageFromClient) {
    const currentState = this.clientState.get(ws);
    const clientActiveId = currentState?.activeAccountId || this.activeAccountId;
    const targetAccountId = msg.type === 'SELECT_ACCOUNT' ? msg.accountId : (msg as any).accountId || clientActiveId;

    switch (msg.type) {
      case 'SELECT_ACCOUNT':
        this.selectAccountForClient(ws, msg.accountId);
        break;
      case 'ADD_ACCOUNT':
        this.addAccount(msg.profile).then((newId) => {
          this.selectAccountForClient(ws, newId);
        });
        break;
      case 'UPDATE_ACCOUNT':
        if (msg.profile.serverHost && msg.profile.username) {
          this.updateServerAccount(
            msg.profile.serverHost,
            msg.profile.serverPort || 25565,
            msg.profile.username,
            msg.profile.password,
            msg.profile.accountType || 'mojang',
            msg.profile.method || 'mcc',
            msg.profile.minecraftVersion,
            msg.accountId
          );
          // Update script if provided
          if (msg.profile.script !== undefined) {
            const targetId = msg.accountId || clientActiveId;
            const inst = this.instances.get(targetId);
            if (inst) {
              inst.profile.script = msg.profile.script || undefined;
              this.saveAccountsToDisk(Array.from(this.instances.values()).map((i) => i.profile));
              this.generateRunSh(inst);
              this.broadcastAccountsList();
            }
          }
        }
        break;
      case 'DELETE_ACCOUNT':
        this.deleteAccount(msg.accountId);
        break;
      case 'START_MCC':
        this.startMCC(targetAccountId);
        break;
      case 'STOP_MCC':
        this.stopMCC(targetAccountId);
        break;
      case 'RESTART_MCC':
        this.restartMCC(targetAccountId);
        break;
      case 'SEND_COMMAND':
      case 'SEND_CHAT':
        this.sendCommand(msg.type === 'SEND_COMMAND' ? msg.command : msg.message, targetAccountId);
        break;
      case 'BROADCAST_COMMAND':
        this.broadcastCommand(msg.accountIds || [], msg.command, msg.staggerMs);
        break;
      case 'BROADCAST_START':
        this.broadcastStart(msg.accountIds || [], msg.staggerMs);
        break;
      case 'BROADCAST_STOP':
        this.broadcastStop(msg.accountIds || []);
        break;
      case 'GET_INI':
        this.sendIniContentToClient(ws, targetAccountId);
        break;
      case 'SAVE_INI':
        // MCC rewrites bot.ini from memory on exit, so write our content AFTER stopping
        // the process, otherwise the editor changes get clobbered.
        this.stopThenSaveIniAndRestart(targetAccountId, msg.content).catch((err) =>
          this.addLog(targetAccountId, 'error', `Lỗi khi lưu INI: ${err.message}`)
        );
        break;
      case 'UPDATE_MAP_COLORS':
        try {
          const colors = Array.isArray(msg.colors) ? msg.colors : [];
          if (colors.length > 0) {
            const buf = renderMapPaletteToPngBuffer(colors as number[]);
            updateCurrentCaptchaPngBuffer(buf);
            this.addLog(targetAccountId, 'system', `🗺️ Đã cập nhật Map Captcha từ ${colors.length} ô màu packet.`);
          }
        } catch (err: any) {
          this.addLog(targetAccountId, 'error', `Lỗi khi render Map Captcha: ${err.message}`);
        }
        break;
      case 'UPDATE_SERVER_ACCOUNT':
        this.updateServerAccount(
          msg.host,
          msg.port,
          msg.username,
          msg.password,
          msg.accountType,
          msg.method,
          msg.minecraftVersion,
          targetAccountId
        );
        break;
      case 'ENABLE_SILENT_MODE':
        this.enableSilentMode(targetAccountId);
        break;
      case 'SET_AUTORELOG':
        this.setAutoRelog(msg.enabled, targetAccountId);
        break;
      case 'AUTO_FIX_INI':
        this.autoFixIni(targetAccountId);
        break;
      case 'GET_SHORTCUTS':
        this.sendShortcutsToClient(ws, targetAccountId);
        break;
      case 'ADD_SHORTCUT':
        this.addShortcut(msg.scope, msg.label, msg.command, msg.scope === 'global' ? undefined : targetAccountId).then((ok) => {
          this.sendShortcutsToClient(ws, targetAccountId);
          this.addLog(targetAccountId, 'system', ok ? `⚡ Đã thêm phím tắt "${msg.label}"${msg.scope === 'global' ? ' (cho mọi bot)' : ''}.` : '⚠️ Không thêm được phím tắt (thiếu nhãn hoặc lệnh).');
        });
        break;
      case 'DELETE_SHORTCUT':
        this.deleteShortcut(msg.scope, msg.shortcutId, msg.scope === 'global' ? undefined : targetAccountId).then((ok) => {
          this.sendShortcutsToClient(ws, targetAccountId);
          if (ok) this.addLog(targetAccountId, 'system', `🗑️ Đã xóa phím tắt${msg.scope === 'global' ? ' (toàn cục)' : ' (bot này)'}.`);
        });
        break;
    }
  }
}

export const mccManager = new MCCManager();
