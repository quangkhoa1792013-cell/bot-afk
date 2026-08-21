import * as mineflayer from 'mineflayer'
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder'
import type { Bot } from 'mineflayer'
import { AutoEater } from './autoeat'
import { startViewer, ViewerHandle } from './viewer'
import { AppConfig, LogLevel } from './config'
import {
  BotStateSnapshot,
  MoveOptions,
  Position,
  RuntimeConfigPatch,
} from './types'

export type Logger = (level: LogLevel, msg: string) => void

export class BotRunner {
  private bot: Bot | null = null
  private viewer: ViewerHandle | null = null
  private eater: AutoEater | null = null
  private movements: Movements | null = null
  private startedAt = Date.now()
  private target: Position | null = null
  private moving = false
  private deaths = 0
  private lastError: string | null = null
  private stopped = false

  constructor(
    private cfg: AppConfig,
    private log: Logger
  ) {}

  socketPath(): string | undefined {
    return this.cfg.ipc.socketPath
  }

  async start(): Promise<void> {
    this.stopped = false
    this.connect()
  }

  async shutdown(): Promise<void> {
    this.stopped = true
    this.viewer?.close()
    try {
      this.bot?.quit()
    } catch {}
  }

  snapshot(): BotStateSnapshot {
    const b = this.bot
    const p = b?.entity?.position
    const viewerPort = this.cfg.viewer.enabled ? this.cfg.viewer.port : null
    return {
      connected: !!b && b.player !== undefined && !!this.spawnedFlag,
      username: this.cfg.account.username,
      version:
        (typeof this.cfg.server.version === 'string' ? this.cfg.server.version : '') ||
        String((b as any)?.version || 'unknown'),
      mock: false,
      position: p ? { x: round2(p.x), y: round2(p.y), z: round2(p.z) } : null,
      health: b ? Math.round(b.health ?? 0) : 0,
      food: b ? Math.round(b.food ?? 0) : 0,
      saturation: b ? Math.round(((b as any).saturation ?? 0) as number) : 0,
      target: this.target,
      moving: this.moving,
      eating: this.eater?.isBusy() ?? false,
      viewerPort,
      viewerUrl: viewerPort ? `http://localhost:${viewerPort}` : null,
      serverHost: this.cfg.server.host,
      serverPort: this.cfg.server.port,
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      deaths: this.deaths,
      lastError: this.lastError,
    }
  }

  private spawnedFlag = false

  private connect(): void {
    const cfg = this.cfg
    const options: Record<string, unknown> = {
      host: cfg.server.host,
      port: cfg.server.port,
      username: cfg.account.username,
      auth: 'offline',
      checkTimeoutInterval: 60000,
    }
    if (cfg.server.version) options.version = cfg.server.version

    let bot: Bot
    try {
      bot = mineflayer.createBot(options as any)
    } catch (err: any) {
      this.lastError = `createBot failed: ${err.message}`
      this.log('error', this.lastError)
      if (!cfg.server.version) throw err
      this.log('warn', `version ${cfg.server.version} unsupported, retrying auto-detect`)
      cfg.server.version = false
      return setTimeout(() => this.connect(), 1000) as unknown as void
    }

    this.bot = bot
    this.spawnedFlag = false
    this.eater = new AutoEater(bot, {
      enabled: cfg.autoEat.enabled,
      startAtFood: cfg.autoEat.startAtFood,
      lowHealth: cfg.autoEat.lowHealth,
      bannedFood: new Set(cfg.autoEat.bannedFood),
    })

    bot.loadPlugin(pathfinder)

    bot.once('resourcePack', () => {})
    bot.on('login', () => this.log('info', `logged in as ${bot.username}`))
    bot.on('spawn', () => {
      this.spawnedFlag = true
      this.movements = new Movements(bot)
      this.applyMovementConfig()
      this.eater?.buildFoodMap().catch(() => {})
      this.startViewerIfNeeded()
      this.log('info', `spawned at ${fmtPos(bot.entity?.position)}`)
      if (cfg.movement.sprint) {
        bot.setControlState('sprint', true)
      }
    })
    bot.on('death', () => {
      this.deaths += 1
      this.target = null
      this.moving = false
      this.log('warn', 'bot died')
    })
    bot.on('health', () => {
      this.eater?.tick().catch(() => {})
    })
    bot.on('kicked', (reason: string) => this.log('warn', `kicked: ${reason}`))
    bot.on('error', (err: Error) => {
      this.lastError = err.message
      this.log('error', `connection error: ${err.message}`)
    })
    bot.on('end', (reason: string) => {
      this.spawnedFlag = false
      this.viewer?.close()
      this.viewer = null
      this.bot = null
      this.moving = false
      this.target = null
      this.log('warn', `disconnected: ${reason}`)
      if (!this.stopped && cfg.bot.autoReconnect) {
        setTimeout(() => this.connect(), cfg.bot.reconnectDelayMs)
      }
    })

    setInterval(() => {
      this.eater?.tick().catch(() => {})
    }, 1000).unref()
  }

  private applyMovementConfig(): void {
    if (!this.movements) return
    const m = this.movements as unknown as Record<string, unknown>
    m.sprint = this.cfg.movement.sprint
    m.canDig = this.cfg.movement.canDig
    m.allowParkour = this.cfg.movement.allowParkour
    m.allow1by1towers = true
    m.allowSprinting = this.cfg.movement.sprint
    m.allowJumping = true
    if (this.bot) (this.bot as any).pathfinder.setMovements(this.movements)
  }

  private startViewerIfNeeded(): void {
    if (!this.cfg.viewer.enabled || this.viewer) return
    this.viewer = startViewer(
      this.bot!,
      this.cfg.viewer.port,
      this.cfg.viewer.firstPerson
    )
    if (this.viewer) {
      this.log('info', `viewer running on http://localhost:${this.cfg.viewer.port}`)
    } else {
      this.log('warn', 'prismarine-viewer failed to start')
    }
  }

  async goto(x: number, y: number, z: number, opts?: MoveOptions): Promise<Record<string, unknown>> {
    const bot = this.bot
    if (!bot || !bot.entity) throw new Error('not spawned yet')
    if (!this.movements) {
      this.movements = new Movements(bot)
      this.applyMovementConfig()
    }
    this.applyMovementConfig()
    this.target = { x, y, z }
    this.moving = true

    const range =
      opts?.range !== undefined ? opts.range : this.cfg.movement.goalTolerance
    const goal = new goals.GoalBlock(Math.floor(x), Math.floor(y), Math.floor(z))

    let timeoutId: NodeJS.Timeout | null = null
    if (opts?.timeoutMs && opts.timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        try {
          ;(bot as any).pathfinder.setGoal(null)
        } catch {}
      }, opts.timeoutMs)
      timeoutId.unref?.()
    }

    try {
      await (bot as any).pathfinder.goto(goal)
      return { ok: true, arrived: true, distance: range }
    } catch (err: any) {
      const msg = String(err?.name || '') === 'NoPath' ? 'no path found' : err.message
      return { ok: false, error: msg }
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      this.moving = false
      if (this.cfg.movement.sprint) bot.setControlState('sprint', true)
    }
  }

  stop(): Record<string, unknown> {
    const bot = this.bot
    if (bot) {
      try {
        ;(bot as any).pathfinder.setGoal(null)
        bot.clearControlStates()
      } catch {}
    }
    this.target = null
    this.moving = false
    return { ok: true }
  }

  setConfig(patch: RuntimeConfigPatch): Record<string, unknown> {
    if (patch.autoEatStartAtFood !== undefined)
      this.cfg.autoEat.startAtFood = patch.autoEatStartAtFood
    if (patch.autoEatLowHealth !== undefined)
      this.cfg.autoEat.lowHealth = patch.autoEatLowHealth
    if (patch.bannedFoodExtra && Array.isArray(patch.bannedFoodExtra)) {
      for (const f of patch.bannedFoodExtra) this.cfg.autoEat.bannedFood.push(f)
    }
    this.eater?.updateOptions({
      enabled: this.cfg.autoEat.enabled,
      startAtFood: this.cfg.autoEat.startAtFood,
      lowHealth: this.cfg.autoEat.lowHealth,
    })
    if (
      patch.canDig !== undefined ||
      patch.allowParkour !== undefined ||
      patch.sprint !== undefined
    ) {
      if (patch.canDig !== undefined) this.cfg.movement.canDig = patch.canDig
      if (patch.allowParkour !== undefined)
        this.cfg.movement.allowParkour = patch.allowParkour
      if (patch.sprint !== undefined) this.cfg.movement.sprint = patch.sprint
      this.applyMovementConfig()
    }
    return { ok: true }
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function fmtPos(p: { x: number; y: number; z: number } | undefined): string {
  if (!p) return '?'
  return `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`
}
