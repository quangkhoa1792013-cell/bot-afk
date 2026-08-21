import * as fs from 'node:fs'
import * as path from 'node:path'
import { parse } from 'smol-toml'
import type { RuntimeConfigPatch } from './types'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface AppConfig {
  server: { host: string; port: number; version: string | false }
  account: { username: string; password: string }
  bot: {
    autoReconnect: boolean
    reconnectDelayMs: number
    spawnWaitTimeoutMs: number
  }
  movement: {
    sprint: boolean
    canDig: boolean
    allowParkour: boolean
    goalTolerance: number
  }
  autoEat: {
    enabled: boolean
    startAtFood: number
    lowHealth: number
    bannedFood: string[]
  }
  viewer: { enabled: boolean; port: number; firstPerson: boolean }
  ipc: { socketPath?: string }
}

const DEFAULTS: AppConfig = {
  server: { host: 'localhost', port: 25565, version: false },
  account: { username: 'MineBot', password: '' },
  bot: { autoReconnect: true, reconnectDelayMs: 5000, spawnWaitTimeoutMs: 30000 },
  movement: { sprint: true, canDig: false, allowParkour: true, goalTolerance: 1.0 },
  autoEat: {
    enabled: true,
    startAtFood: 14,
    lowHealth: 10,
    bannedFood: ['rotten_flesh', 'pufferfish', 'spider_eye', 'poisonous_potato'],
  },
  viewer: { enabled: true, port: 3001, firstPerson: true },
  ipc: {},
}

export function defaultSocketPath(): string {
  const xdg = process.env.XDG_RUNTIME_DIR
  if (xdg) return path.join(xdg, 'minebot', 'bot.sock')
  const uid = process.getuid ? process.getuid() : 1000
  return `/tmp/minebot-${uid}/bot.sock`
}

export function findConfigPath(explicit?: string): string {
  if (explicit) return explicit
  if (process.env.MINEBOT_CONFIG) return process.env.MINEBOT_CONFIG
  const home = process.env.HOME || '.'
  const candidate = path.join(home, '.config', 'minebot', 'config.toml')
  if (fs.existsSync(candidate)) return candidate
  return path.resolve('config.toml')
}

function mergeSection<T extends object>(base: T, patch: object | undefined): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  if (patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined && v !== null) out[k] = v
    }
  }
  return out as T
}

export function loadConfig(filePath: string): AppConfig {
  let raw: Record<string, any> = {}
  if (fs.existsSync(filePath)) {
    const text = fs.readFileSync(filePath, 'utf8')
    raw = parse(text) as Record<string, any>
  }
  const cfg: AppConfig = {
    server: mergeSection(DEFAULTS.server, raw.server),
    account: mergeSection(DEFAULTS.account, raw.account),
    bot: mergeSection(DEFAULTS.bot, raw.bot),
    movement: mergeSection(DEFAULTS.movement, raw.movement),
    autoEat: mergeSection(DEFAULTS.autoEat, raw.autoEat),
    viewer: mergeSection(DEFAULTS.viewer, raw.viewer),
    ipc: mergeSection(DEFAULTS.ipc, raw.ipc),
  }
  if (!cfg.ipc.socketPath) cfg.ipc.socketPath = defaultSocketPath()
  if (cfg.server.version === '') cfg.server.version = false
  return cfg
}

export function applyPatch(cfg: AppConfig, patch: RuntimeConfigPatch): void {
  if (patch.autoEatStartAtFood !== undefined) cfg.autoEat.startAtFood = patch.autoEatStartAtFood
  if (patch.autoEatLowHealth !== undefined) cfg.autoEat.lowHealth = patch.autoEatLowHealth
  if (patch.canDig !== undefined) cfg.movement.canDig = patch.canDig
  if (patch.allowParkour !== undefined) cfg.movement.allowParkour = patch.allowParkour
  if (patch.sprint !== undefined) cfg.movement.sprint = patch.sprint
}
