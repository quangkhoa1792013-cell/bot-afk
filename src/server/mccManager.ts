import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import fsPromises from 'fs/promises';
import pathModule from 'path';
import { WebSocket } from 'ws';
import Convert from 'ansi-to-html';
import ini from 'ini';
import { MCCProcessStatus, ChatMessageLog, WSMessageFromServer, WSMessageFromClient } from '../types.js';


const ansiConverter = new Convert({
  fg: '#e2e8f0',
  bg: '#0f172a',
  newline: true,
  escapeXML: true,
  stream: false
});

export class MCCManager {
  private mccProcess: ChildProcess | null = null;
  private wsClients: Set<WebSocket> = new Set();
  private logs: ChatMessageLog[] = [];
  private maxLogs = 1000;
  private startTime: number = 0;
  private logSeq: number = 0;
  private iniPath = pathModule.join(process.cwd(), 'MinecraftClient.ini');
  private binaryPath = pathModule.join(process.cwd(), 'MinecraftClient');

  constructor() {
    this.ensureBinaryAndIni();
  }

  private async ensureBinaryAndIni() {
    // 1. Ensure matches.ini exists to prevent warning
    const matchesPath = pathModule.join(process.cwd(), 'matches.ini');
    try {
      await fsPromises.access(matchesPath);
    } catch {
      await fsPromises.writeFile(matchesPath, '[AutoRespond]\n', 'utf-8');
    }

    // 2. Check if MinecraftClient binary exists
    try {
      await fsPromises.access(this.binaryPath);
    } catch {
      this.addLog('system', '[MCC Manager] MinecraftClient binary not found. Downloading latest Linux x64 binary...');
      await this.downloadMCCBinary();
    }
  }

  private async downloadMCCBinary() {
    try {
      const url = 'https://github.com/MCCTeam/Minecraft-Console-Client/releases/download/20260727-498/MinecraftClient-20260727-498-linux-x64';
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fsPromises.writeFile(this.binaryPath, buffer);
      await fsPromises.chmod(this.binaryPath, 0o755);
      this.addLog('system', '✅ Successfully downloaded MinecraftClient executable!');
    } catch (err: any) {
      this.addLog('error', `Failed to download MinecraftClient binary: ${err.message}`);
    }
  }

  public addClient(ws: WebSocket) {
    this.wsClients.add(ws);
    // Send initial status and existing logs
    ws.send(JSON.stringify({ type: 'MCC_STATUS', status: this.getStatus() }));
    for (const log of this.logs.slice(-150)) {
      ws.send(JSON.stringify({ type: 'LOG_MESSAGE', log }));
    }
    this.sendIniContentToClient(ws);

    ws.on('close', () => {
      this.wsClients.delete(ws);
    });
  }

  public broadcast(msg: WSMessageFromServer) {
    const payload = JSON.stringify(msg);
    for (const client of Array.from(this.wsClients)) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      } else if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
        this.wsClients.delete(client);
      }
    }
  }

  private addLog(type: ChatMessageLog['type'], text: string, rawAnsi?: string) {
    let ansiHtml = '';
    if (rawAnsi) {
      try {
        ansiHtml = ansiConverter.toHtml(rawAnsi);
      } catch {
        ansiHtml = text;
      }
    }

    this.logSeq++;
    const log: ChatMessageLog = {
      id: `log-${Date.now()}-${this.logSeq}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString(),
      text,
      ansiHtml,
      type
    };

    this.logs.push(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.broadcast({ type: 'LOG_MESSAGE', log });
  }

  private parseAndBroadcastCoords(text: string) {
    // Regex 1: X: -123.4, Y: 64, Z: 567.8
    const r1 = /X:\s*(-?\d+(?:\.\d+)?)\s*,?\s*Y:\s*(-?\d+(?:\.\d+)?)\s*,?\s*Z:\s*(-?\d+(?:\.\d+)?)/i.exec(text);
    if (r1) {
      const x = parseFloat(r1[1]);
      const y = parseFloat(r1[2]);
      const z = parseFloat(r1[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        this.broadcast({
          type: 'POSITION_UPDATE',
          position: { x, y, z, yaw: 0, pitch: 0 }
        });
        return;
      }
    }

    // Regex 2: Position/Location/Coords: (-123, 64, 567) or Logged in at (-123, 64, 567)
    const r2 = /(?:position|location|coords|at)\D*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i.exec(text);
    if (r2) {
      const x = parseFloat(r2[1]);
      const y = parseFloat(r2[2]);
      const z = parseFloat(r2[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        this.broadcast({
          type: 'POSITION_UPDATE',
          position: { x, y, z, yaw: 0, pitch: 0 }
        });
        return;
      }
    }
  }

  public getStatus(): MCCProcessStatus {
    let raw = '';
    try {
      raw = fs.readFileSync(this.iniPath, 'utf-8');
    } catch {}

    let serverHost = 'aquamc.vn';
    let serverPort = 25565;
    let username = 'geasf';
    let accountType = 'mojang';
    let minecraftVersion = 'auto';

    if (raw) {
      // Host & Port
      const hostMatch = raw.match(/Host\s*=\s*"([^"]+)"/i) || raw.match(/Server\s*=\s*\{[^}]*Host\s*=\s*"([^"]+)"/i);
      if (hostMatch) serverHost = hostMatch[1];

      const portMatch = raw.match(/Port\s*=\s*(\d+)/i) || raw.match(/Server\s*=\s*\{[^}]*Port\s*=\s*(\d+)/i);
      if (portMatch) serverPort = parseInt(portMatch[1], 10);

      // Account / Login
      const userMatch = raw.match(/Login\s*=\s*"([^"]+)"/i) || raw.match(/Account\s*=\s*\{[^}]*Login\s*=\s*"([^"]+)"/i);
      if (userMatch) username = userMatch[1];

      // AccountType
      const accTypeMatch = raw.match(/AccountType\s*=\s*"([^"]+)"/i);
      if (accTypeMatch) accountType = accTypeMatch[1];

      // MinecraftVersion
      const mcVerMatch = raw.match(/MinecraftVersion\s*=\s*"([^"]+)"/i);
      if (mcVerMatch) minecraftVersion = mcVerMatch[1];
    }

    return {
      running: !!this.mccProcess && !this.mccProcess.killed,
      pid: this.mccProcess?.pid || null,
      uptimeSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      serverHost,
      serverPort,
      username,
      accountType,
      minecraftVersion,
      lastLog: this.logs.length > 0 ? this.logs[this.logs.length - 1].text : undefined
    };
  }

  public async startMCC() {
    if (this.mccProcess && !this.mccProcess.killed) {
      this.addLog('system', '[MCC Manager] Minecraft Console Client is already running.');
      return;
    }

    await this.ensureBinaryAndIni();

    this.addLog('system', '🚀 Launching Minecraft Console Client (MCC)...');
    try {
      this.mccProcess = spawn(this.binaryPath, [], {
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'xterm-256color' }
      });

      this.startTime = Date.now();
      this.broadcastStatus();

      if (this.mccProcess.stdout) {
        this.mccProcess.stdout.on('data', (chunk: Buffer) => {
          const raw = chunk.toString('utf-8');
          const lines = raw.split(/\r?\n/);
          for (const line of lines) {
            if (!line.trim()) continue;
            // Strip ANSI escape sequence for clean text
            const cleanText = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
            this.addLog('mcc', cleanText, line);
            this.parseAndBroadcastCoords(cleanText);
          }
        });
      }

      if (this.mccProcess.stderr) {
        this.mccProcess.stderr.on('data', (chunk: Buffer) => {
          const line = chunk.toString('utf-8').trim();
          if (line) {
            this.addLog('error', `[stderr] ${line}`, line);
          }
        });
      }

      this.mccProcess.on('exit', (code, signal) => {
        this.addLog('kicked', `[MCC Process Exited] Exit Code: ${code ?? 'N/A'}, Signal: ${signal ?? 'N/A'}`);
        this.mccProcess = null;
        this.startTime = 0;
        this.broadcastStatus();
      });

      this.mccProcess.on('error', (err) => {
        this.addLog('error', `[MCC Process Error] ${err.message}`);
        this.mccProcess = null;
        this.startTime = 0;
        this.broadcastStatus();
      });

    } catch (err: any) {
      this.addLog('error', `Failed to start MCC process: ${err.message}`);
    }
  }

  public stopMCC() {
    if (!this.mccProcess) {
      this.addLog('system', '[MCC Manager] No active MCC process to stop.');
      return;
    }

    this.addLog('system', '⏹️ Stopping Minecraft Console Client...');
    try {
      // Send /quit command to MCC stdin for clean shutdown
      if (this.mccProcess.stdin && !this.mccProcess.stdin.destroyed) {
        this.mccProcess.stdin.write('/quit\n');
      }

      setTimeout(() => {
        if (this.mccProcess && !this.mccProcess.killed) {
          this.mccProcess.kill('SIGKILL');
        }
      }, 1500);
    } catch (e) {
      this.mccProcess.kill('SIGKILL');
    }
  }

  public async restartMCC() {
    this.stopMCC();
    setTimeout(() => {
      this.startMCC();
    }, 2000);
  }

  public sendCommand(cmd: string) {
    if (!this.mccProcess || !this.mccProcess.stdin || this.mccProcess.killed) {
      this.addLog('error', `Cannot send command "${cmd}": MCC is not running.`);
      return;
    }

    this.addLog('action', `> ${cmd}`);
    this.mccProcess.stdin.write(cmd + '\n');
  }

  public async getIniContent(): Promise<string> {
    try {
      return await fsPromises.readFile(this.iniPath, 'utf-8');
    } catch {
      return '';
    }
  }

  public getParsedIniSync(): Record<string, any> {
    try {
      const raw = fs.readFileSync(this.iniPath, 'utf-8');
      return ini.parse(raw);
    } catch {
      return {};
    }
  }

  public async saveIniContent(content: string): Promise<boolean> {
    try {
      await fsPromises.writeFile(this.iniPath, content, 'utf-8');
      this.addLog('system', '💾 Updated MinecraftClient.ini saved successfully!');
      this.broadcastIniContent();
      this.broadcastStatus();
      return true;
    } catch (err: any) {
      this.addLog('error', `Failed to save MinecraftClient.ini: ${err.message}`);
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
    minecraftVersion?: string
  ) {
    try {
      let raw = await this.getIniContent();
      
      // Update Server Host & Port
      const safePort = !isNaN(Number(port)) && Number(port) >= 0 && Number(port) <= 65535 ? Math.floor(Number(port)) : 25565;
      const portPart = `, Port = ${safePort}`;
      if (/Server\s*=\s*\{[^}]*\}/.test(raw)) {
        raw = raw.replace(/Server\s*=\s*\{[^}]*\}/, `Server = { Host = "${host}"${portPart} }`);
      } else {
        raw += `\nServer = { Host = "${host}"${portPart} }\n`;
      }

      // Update Account Login
      const passVal = password && password.trim() ? `"${password.trim()}"` : `"-"`;
      if (/Account\s*=\s*\{[^}]*\}/.test(raw)) {
        raw = raw.replace(/Account\s*=\s*\{[^}]*\}/, `Account = { Login = "${username}", Password = ${passVal} }`);
      } else {
        raw += `\nAccount = { Login = "${username}", Password = ${passVal} }\n`;
      }

      // Update AccountType
      if (/AccountType\s*=\s*".*"/.test(raw)) {
        raw = raw.replace(/AccountType\s*=\s*".*"/, `AccountType = "${accountType}"`);
      } else {
        raw += `\nAccountType = "${accountType}"\n`;
      }

      // Update Method
      if (/Method\s*=\s*".*"/.test(raw)) {
        raw = raw.replace(/Method\s*=\s*".*"/, `Method = "${method}"`);
      }

      // Update MinecraftVersion if passed
      if (minecraftVersion) {
        if (/MinecraftVersion\s*=\s*".*"/.test(raw)) {
          raw = raw.replace(/MinecraftVersion\s*=\s*".*"/, `MinecraftVersion = "${minecraftVersion}"`);
        } else {
          raw += `\nMinecraftVersion = "${minecraftVersion}"\n`;
        }
      }

      await this.saveIniContent(raw);
    } catch (err: any) {
      this.addLog('error', `Failed to update server/account settings: ${err.message}`);
    }
  }

  public async enableSilentMode(): Promise<boolean> {
    try {
      let raw = await this.getIniContent();

      // Disable AutoRelog
      if (/\[ChatBot.AutoRelog\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.AutoRelog\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
      } else {
        raw += '\n[ChatBot.AutoRelog]\nEnabled = false\n';
      }

      // Disable ScriptScheduler
      if (/\[ChatBot.ScriptScheduler\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.ScriptScheduler\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
      } else {
        raw += '\n[ChatBot.ScriptScheduler]\nEnabled = false\n';
      }

      // Disable AutoRespond
      if (/\[ChatBot.AutoRespond\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.AutoRespond\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
      } else {
        raw += '\n[ChatBot.AutoRespond]\nEnabled = false\n';
      }

      // Disable AutoEat
      if (/\[ChatBot.AutoEat\][^\[]*/.test(raw)) {
        raw = raw.replace(/(\[ChatBot\.AutoEat\][^\[]*?Enabled\s*=\s*)(true|false)/i, '$1false');
      }

      // Ensure 24-bit VT100 ANSI mode for console map preview
      if (raw.includes('ConsoleColorMode')) {
        raw = raw.replace(/ConsoleColorMode\s*=\s*".*?"/g, 'ConsoleColorMode = "vt100_24bit"');
      } else {
        raw += '\n[Console.General]\nConsoleColorMode = "vt100_24bit"\n';
      }

      await this.saveIniContent(raw);
      this.addLog('system', '🔇 Chế độ Im Lặng (Silent Anti-Kick) đã bật! Đã tắt sạch AutoRelog, ScriptScheduler, AutoRespond để bảo vệ bot khi join.');
      return true;
    } catch (err: any) {
      this.addLog('error', `Lỗi khi bật Chế Độ Im Lặng: ${err.message}`);
      return false;
    }
  }

  public async sendIniContentToClient(ws: WebSocket) {
    const content = await this.getIniContent();
    const parsed = ini.parse(content);
    ws.send(JSON.stringify({ type: 'INI_CONTENT', content, parsed }));
  }

  public async broadcastIniContent() {
    const content = await this.getIniContent();
    const parsed = ini.parse(content);
    this.broadcast({ type: 'INI_CONTENT', content, parsed });
  }

  public broadcastStatus() {
    this.broadcast({ type: 'MCC_STATUS', status: this.getStatus() });
  }

  public handleClientMessage(msg: WSMessageFromClient) {
    switch (msg.type) {
      case 'START_MCC':
        this.startMCC();
        break;
      case 'STOP_MCC':
        this.stopMCC();
        break;
      case 'RESTART_MCC':
        this.restartMCC();
        break;
      case 'SEND_COMMAND':
      case 'SEND_CHAT':
        this.sendCommand(msg.type === 'SEND_COMMAND' ? msg.command : msg.message);
        break;
      case 'GET_INI':
        this.broadcastIniContent();
        break;
      case 'SAVE_INI':
        this.saveIniContent(msg.content);
        break;
      case 'UPDATE_SERVER_ACCOUNT':
        this.updateServerAccount(msg.host, msg.port, msg.username, msg.password, msg.accountType, msg.method);
        break;
      case 'ENABLE_SILENT_MODE':
        this.enableSilentMode();
        break;
    }
  }
}

export const mccManager = new MCCManager();
