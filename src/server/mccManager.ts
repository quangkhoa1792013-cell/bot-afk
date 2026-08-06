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
} from '../types.js';
import { fixAndSanitizeIniContent } from '../lib/iniHelper.js';

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
}

/**
 * Backoff delays (ms) for auto-relaunch after a quick login failure (EOF / rate-limit drop).
 * AquaMC rate-limits logins per IP (~60s window, kick: "You are logging in too fast").
 * Retrying at 8s just re-hits the still-active rate limit, so we wait 60s/2m/5m instead.
 */
const RELAUNCH_BACKOFFS = [60000, 120000, 300000];
const QUICK_EXIT_THRESHOLD_MS = 45000;

export class MCCManager {
  private instances: Map<string, AccountInstance> = new Map();
  private clientState: Map<WebSocket, { activeAccountId: string }> = new Map();
  private maxLogs = 1000;
  private binaryPath = pathModule.join(process.cwd(), 'MinecraftClient');
  private botsDir = pathModule.join(process.cwd(), 'bots');
  private scriptsDir = pathModule.join(process.cwd(), 'scripts');
  private activeAccountId: string = '';

  constructor() {
    this.init();
  }

  private async init() {
    await this.ensureBinaryAndIni();
    await this.loadAccounts();
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
      const sh = `#!/bin/bash
# Auto-generated launcher for bot: ${inst.profile.name}
# Account: ${inst.profile.username} @ ${inst.profile.serverHost}:${inst.profile.serverPort}
cd "$(dirname "$0")/../.."
./MinecraftClient "${inst.iniPath}"${scriptArg}
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

  private syncProfileToIni(iniPath: string, prof: Partial<AccountProfile>) {
    try {
      let raw = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, 'utf-8') : '';
      const creds = this.resolveCredentials(prof.accountType || 'mojang', prof.password);

      if (prof.serverHost) {
        const port = prof.serverPort || 25565;
        if (/Server\s*=\s*\{[^}]*\}/.test(raw)) {
          raw = raw.replace(/Server\s*=\s*\{[^}]*\}/, `Server = { Host = "${this.iniSafe(prof.serverHost)}", Port = ${port} }`);
        } else {
          raw += `\nServer = { Host = "${this.iniSafe(prof.serverHost)}", Port = ${port} }\n`;
        }
      }

      if (prof.username) {
        if (/Account\s*=\s*\{[^}]*\}/.test(raw)) {
          raw = raw.replace(/Account\s*=\s*\{[^}]*\}/, `Account = { Login = "${this.iniSafe(prof.username)}", Password = "${creds.password}" }`);
        } else {
          raw += `\nAccount = { Login = "${this.iniSafe(prof.username)}", Password = "${creds.password}" }\n`;
        }
      }

      if (creds.accountType) {
        if (/^(\s*AccountType\s*=\s*)"[^"]*"/m.test(raw)) {
          raw = raw.replace(/^(\s*AccountType\s*=\s*)"[^"]*"/m, `$1"${creds.accountType}"`);
        } else {
          raw += `\nAccountType = "${creds.accountType}"\n`;
        }
      }

      if (prof.minecraftVersion) {
        if (/^(\s*MinecraftVersion\s*=\s*)"[^"]*"/m.test(raw)) {
          raw = raw.replace(/^(\s*MinecraftVersion\s*=\s*)"[^"]*"/m, `$1"${prof.minecraftVersion}"`);
        } else {
          raw += `\nMinecraftVersion = "${prof.minecraftVersion}"\n`;
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
        inst.position = { ...inst.position, x, y, z };
        this.broadcast({ type: 'POSITION_UPDATE', position: inst.position, accountId }, accountId);
        return;
      }
    }

    const r2 = /(?:position|location|coords|at)\D*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(text);
    if (r2) {
      const x = parseFloat(r2[1]);
      const y = parseFloat(r2[2]);
      const z = parseFloat(r2[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        inst.position = { ...inst.position, x, y, z };
        this.broadcast({ type: 'POSITION_UPDATE', position: inst.position, accountId }, accountId);
        return;
      }
    }
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
      // Spawn MCC process with the bot's own INI file + optional login script
      const args: string[] = [inst.iniPath];
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

      inst.mccProcess.on('exit', (code, signal) => {
        const uptimeMs = inst.startTime ? Date.now() - inst.startTime : 0;
        this.addLog(targetId, 'kicked', `[MCC Process Exited] Exit Code: ${code ?? 'N/A'}, Signal: ${signal ?? 'N/A'}, Uptime: ${Math.floor(uptimeMs / 1000)}s`);
        inst.mccProcess = null;
        inst.startTime = 0;
        this.broadcastStatus(targetId);

        // Auto-relaunch when the server drops the connection during login
        // (AquaMC rate-limits logins per IP -> EndOfStreamException / "logging in too fast").
        // Only retry quick exits (< 30s), with backoff, and not when the user stopped it.
        if (
          !inst.stoppedByUser &&
          uptimeMs < QUICK_EXIT_THRESHOLD_MS &&
          inst.retryCount < RELAUNCH_BACKOFFS.length
        ) {
          const delayMs = RELAUNCH_BACKOFFS[inst.retryCount];
          inst.retryCount += 1;
          this.addLog(
            targetId,
            'system',
            `🔄 Server đã drop kết nối khi login (rate-limit/EOF). Tự động kết nối lại lần ${inst.retryCount}/${RELAUNCH_BACKOFFS.length} sau ${Math.round(delayMs / 1000)}s...`
          );
          inst.retryTimer = setTimeout(() => {
            inst.retryTimer = null;
            this.startMCC(targetId, true);
          }, delayMs);
        } else if (!inst.stoppedByUser) {
          inst.retryCount = 0;
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
    if (!inst || !inst.mccProcess || inst.mccProcess.killed) {
      if (inst) inst.mccProcess = null;
      this.addLog(targetId, 'system', `[MCC Manager] No active process to stop for account ${targetId}.`);
      return;
    }

    this.addLog(targetId, 'system', `⏹️ Stopping Minecraft Console Client for account ${inst.profile.name}...`);
    inst.stoppedByUser = true;
    if (inst.retryTimer) {
      clearTimeout(inst.retryTimer);
      inst.retryTimer = null;
    }

    return new Promise<void>((resolve) => {
      let resolved = false;
      const cleanupAndResolve = () => {
        if (!resolved) {
          resolved = true;
          inst.mccProcess = null;
          inst.startTime = 0;
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
  private async stopThenSaveIniAndRestart(targetId: string, raw: string) {
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
        await fsPromises.writeFile(inst.iniPath, repair.repairedIni, 'utf-8');
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

      if (/\[ChatBot\.AutoRelog\]/.test(raw)) {
        if (new RegExp(`\\[ChatBot\\.AutoRelog\\][^\\[]*?Enabled\\s*=\\s*${enabled ? 'true' : 'false'}`, 'i').test(raw)) {
          // already set - nothing to change
        } else {
          raw = raw.replace(/(\[ChatBot\.AutoRelog\][^\[]*?Enabled\s*=\s*)(true|false)/i, `$1${enabled}`);
        }
      } else {
        raw += `\n[ChatBot.AutoRelog]\nEnabled = ${enabled}\n`;
      }

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

      if (/\[ChatBot.AutoRelog\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.AutoRelog\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
      } else {
        raw += '\n[ChatBot.AutoRelog]\nEnabled = false\n';
      }

      if (/\[ChatBot.ScriptScheduler\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.ScriptScheduler\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
      } else {
        raw += '\n[ChatBot.ScriptScheduler]\nEnabled = false\n';
      }

      if (/\[ChatBot.AutoRespond\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.AutoRespond\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
      } else {
        raw += '\n[ChatBot.AutoRespond]\nEnabled = false\n';
      }

      if (/\[ChatBot.AutoEat\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.AutoEat\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
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
      case 'GET_INI':
        this.sendIniContentToClient(ws, targetAccountId);
        break;
      case 'SAVE_INI':
        this.saveIniContent(msg.content, targetAccountId);
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
    }
  }
}

export const mccManager = new MCCManager();
