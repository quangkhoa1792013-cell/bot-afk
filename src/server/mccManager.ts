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
}

export class MCCManager {
  private instances: Map<string, AccountInstance> = new Map();
  private clientState: Map<WebSocket, { activeAccountId: string }> = new Map();
  private maxLogs = 1000;
  private binaryPath = pathModule.join(process.cwd(), 'MinecraftClient');
  private accountsJsonPath = pathModule.join(process.cwd(), 'accounts.json');
  private activeAccountId: string = 'acc-default';

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

    // 2. Ensure MinecraftClient binary exists
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

  private async loadAccounts() {
    let savedProfiles: AccountProfile[] = [];
    try {
      if (fs.existsSync(this.accountsJsonPath)) {
        const raw = fs.readFileSync(this.accountsJsonPath, 'utf-8');
        savedProfiles = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to parse accounts.json:', e);
    }

    // Default fallback if no accounts saved
    if (!savedProfiles || savedProfiles.length === 0) {
      const defaultStatus = this.parseIniToStatus(pathModule.join(process.cwd(), 'MinecraftClient.ini'));
      savedProfiles = [
        {
          id: 'acc-default',
          name: 'Tài Khoản Mặc Định',
          username: defaultStatus.username || 'geasf',
          password: '-',
          accountType: defaultStatus.accountType || 'mojang',
          serverHost: defaultStatus.serverHost || 'york-mark.gl.joinmc.link',
          serverPort: defaultStatus.serverPort || 25565,
          minecraftVersion: defaultStatus.minecraftVersion || 'auto',
          isDefault: true,
        },
      ];
      this.saveAccountsToDisk(savedProfiles);
    }

    // Populate instance map
    for (const prof of savedProfiles) {
      const iniPath =
        prof.id === 'acc-default'
          ? pathModule.join(process.cwd(), 'MinecraftClient.ini')
          : pathModule.join(process.cwd(), `MinecraftClient_${prof.id}.ini`);

      // Ensure INI file exists for custom profiles
      if (!fs.existsSync(iniPath)) {
        let baseIni = '';
        try {
          baseIni = fs.readFileSync(pathModule.join(process.cwd(), 'MinecraftClient.ini'), 'utf-8');
        } catch {
          baseIni = '[Main.General]\nAccount = { Login = "geasf", Password = "-" }\nServer = { Host = "localhost", Port = 25565 }\n';
        }
        fs.writeFileSync(iniPath, baseIni, 'utf-8');
        // Update INI with profile details
        this.syncProfileToIni(iniPath, prof);
      }

      this.instances.set(prof.id, {
        profile: prof,
        iniPath,
        mccProcess: null,
        startTime: 0,
        logs: [],
        logSeq: 0,
        position: { x: 100, y: 64, z: 200, yaw: 180, pitch: 0 },
      });
    }

    if (!this.instances.has(this.activeAccountId)) {
      this.activeAccountId = Array.from(this.instances.keys())[0] || 'acc-default';
    }
  }

  private saveAccountsToDisk(profiles: AccountProfile[]) {
    try {
      fs.writeFileSync(this.accountsJsonPath, JSON.stringify(profiles, null, 2), 'utf-8');
    } catch (e) {
      console.error('Failed to write accounts.json:', e);
    }
  }

  private syncProfileToIni(iniPath: string, prof: Partial<AccountProfile>) {
    try {
      let raw = fs.existsSync(iniPath) ? fs.readFileSync(iniPath, 'utf-8') : '';

      if (prof.serverHost) {
        const port = prof.serverPort || 25565;
        if (/Server\s*=\s*\{[^}]*\}/.test(raw)) {
          raw = raw.replace(/Server\s*=\s*\{[^}]*\}/, `Server = { Host = "${prof.serverHost}", Port = ${port} }`);
        } else {
          raw += `\nServer = { Host = "${prof.serverHost}", Port = ${port} }\n`;
        }
      }

      if (prof.username) {
        const passVal = prof.password && prof.password.trim() ? `"${prof.password.trim()}"` : `"-"`;
        if (/Account\s*=\s*\{[^}]*\}/.test(raw)) {
          raw = raw.replace(/Account\s*=\s*\{[^}]*\}/, `Account = { Login = "${prof.username}", Password = ${passVal} }`);
        } else {
          raw += `\nAccount = { Login = "${prof.username}", Password = ${passVal} }\n`;
        }
      }

      if (prof.accountType) {
        if (/^(\s*AccountType\s*=\s*)"[^"]*"/m.test(raw)) {
          raw = raw.replace(/^(\s*AccountType\s*=\s*)"[^"]*"/m, `$1"${prof.accountType}"`);
        } else {
          raw += `\nAccountType = "${prof.accountType}"\n`;
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

    let serverHost = 'aquamc.vn';
    let serverPort = 25565;
    let username = 'geasf';
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
    };
  }

  public async startMCC(accountId?: string) {
    const targetId = accountId || this.activeAccountId;
    const inst = this.instances.get(targetId);
    if (!inst) return;

    if (inst.mccProcess && !inst.mccProcess.killed) {
      this.addLog(targetId, 'system', `[MCC Manager] Bot "${inst.profile.name}" (${inst.profile.username}) is already running.`);
      return;
    }

    await this.ensureBinaryAndIni();

    this.addLog(targetId, 'system', `🚀 Launching MCC for account: ${inst.profile.name} (${inst.profile.username} @ ${inst.profile.serverHost}:${inst.profile.serverPort})...`);
    try {
      // Spawn MCC process with specific INI file
      const iniArg = inst.iniPath.endsWith('MinecraftClient.ini') ? [] : [inst.iniPath];
      inst.mccProcess = spawn(this.binaryPath, iniArg, {
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
        this.addLog(targetId, 'kicked', `[MCC Process Exited] Exit Code: ${code ?? 'N/A'}, Signal: ${signal ?? 'N/A'}`);
        inst.mccProcess = null;
        inst.startTime = 0;
        this.broadcastStatus(targetId);
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

    inst.profile.serverHost = host;
    inst.profile.serverPort = port;
    inst.profile.username = username;
    if (password !== undefined) inst.profile.password = password;
    inst.profile.accountType = accountType;
    if (minecraftVersion) inst.profile.minecraftVersion = minecraftVersion;

    this.saveAccountsToDisk(Array.from(this.instances.values()).map((i) => i.profile));
    this.syncProfileToIni(inst.iniPath, inst.profile);

    this.broadcastIniContent(targetId);
    this.broadcastStatus(targetId);
    this.broadcastAccountsList();
  }

  public async addAccount(profileData: Omit<AccountProfile, 'id'>) {
    const newId = `acc-${Date.now()}`;
    const newProfile: AccountProfile = {
      ...profileData,
      id: newId,
      serverPort: profileData.serverPort || 25565,
      minecraftVersion: profileData.minecraftVersion || 'auto',
    };

    const iniPath = pathModule.join(process.cwd(), `MinecraftClient_${newId}.ini`);
    let baseIni = '';
    try {
      baseIni = fs.readFileSync(pathModule.join(process.cwd(), 'MinecraftClient.ini'), 'utf-8');
    } catch {
      baseIni = '[Main.General]\nAccount = { Login = "geasf", Password = "-" }\nServer = { Host = "localhost", Port = 25565 }\n';
    }

    fs.writeFileSync(iniPath, baseIni, 'utf-8');
    this.syncProfileToIni(iniPath, newProfile);

    this.instances.set(newId, {
      profile: newProfile,
      iniPath,
      mccProcess: null,
      startTime: 0,
      logs: [],
      logSeq: 0,
      position: { x: 100, y: 64, z: 200, yaw: 180, pitch: 0 },
    });

    this.saveAccountsToDisk(Array.from(this.instances.values()).map((i) => i.profile));
    this.addLog(newId, 'system', `➕ Đã khởi tạo profile bot mới: ${newProfile.name} (${newProfile.username} @ ${newProfile.serverHost}:${newProfile.serverPort})`);

    this.broadcastAccountsList();
    return newId;
  }

  public async deleteAccount(accountId: string) {
    const inst = this.instances.get(accountId);
    if (!inst) return false;

    // Stop process if running
    if (inst.mccProcess) {
      await this.stopMCC(accountId);
    }

    // Remove or reset INI file
    try {
      if (fs.existsSync(inst.iniPath)) {
        if (!inst.iniPath.endsWith('MinecraftClient.ini')) {
          fs.unlinkSync(inst.iniPath);
        }
      }
    } catch (e) {
      console.error(`Failed to delete INI file for ${accountId}:`, e);
    }

    this.instances.delete(accountId);

    // If all accounts were deleted, auto-recreate a fresh default profile
    if (this.instances.size === 0) {
      const defaultProf: AccountProfile = {
        id: 'acc-default',
        name: 'Tài Khoản Mặc Định',
        username: 'geasf',
        password: '-',
        accountType: 'mojang',
        serverHost: 'york-mark.gl.joinmc.link',
        serverPort: 25565,
        minecraftVersion: 'auto',
        isDefault: true,
      };
      const iniPath = pathModule.join(process.cwd(), 'MinecraftClient.ini');
      this.instances.set(defaultProf.id, {
        profile: defaultProf,
        iniPath,
        mccProcess: null,
        startTime: 0,
        logs: [],
        logSeq: 0,
        position: { x: 100, y: 64, z: 200, yaw: 180, pitch: 0 },
      });
      this.syncProfileToIni(iniPath, defaultProf);
    }

    const nextActiveId = Array.from(this.instances.keys())[0];
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

      await this.saveIniContent(raw, targetId);
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
      case 'AUTO_FIX_INI':
        this.autoFixIni(targetAccountId);
        break;
    }
  }
}

export const mccManager = new MCCManager();

