import { loadConfig, findConfigPath, LogLevel } from './config'
import { BotRunner } from './bot'
import { IpcServer } from './ipc'
import { BotStateSnapshot, MoveOptions, RuntimeConfigPatch } from './types'

interface Args {
  config?: string
  mock: boolean
  version?: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const args: Args = { mock: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--mock') args.mock = true
    else if (a === '--config' && argv[i + 1]) {
      args.config = argv[++i]
      i++
    } else if ((a === '--version' || a === '-v') && argv[i + 1]) {
      args.version = argv[++i]
      i++
    }
  }
  return args
}

function main(): void {
  const args = parseArgs()
  const cfgPath = findConfigPath(args.config)
  const cfg = loadConfig(cfgPath)
  if (args.version) cfg.server.version = args.version

  const startedAt = Date.now()
  let lastError: string | null = null
  const logs: string[] = []
  let ipcRef: IpcServer | null = null

  function log(level: 'info' | 'warn' | 'error' | 'debug', msg: string): void {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}`
    logs.push(line)
    if (logs.length > 500) logs.shift()
    if (level === 'error') lastError = msg
    console.log(line)
    try {
      ipcRef?.broadcast({ event: 'log', data: { level, msg } })
    } catch {}
  }

  log('info', `config: ${cfgPath}`)
  log('info', `socket: ${cfg.ipc.socketPath}`)

  if (args.mock) {
    runMock(cfg.ipc.socketPath!, log, startedAt)
    return
  }

  const runner = new BotRunner(cfg, log)

  const ipc = new IpcServer(cfg.ipc.socketPath!, {
    async goto(x: number, y: number, z: number, opts?: MoveOptions) {
      log('info', `goto ${x}, ${y}, ${z}`)
      return runner.goto(x, y, z, opts)
    },
    async stop() {
      log('info', 'stop requested')
      return runner.stop()
    },
    status() {
      return runner.snapshot()
    },
    async setConfig(patch: RuntimeConfigPatch) {
      return runner.setConfig(patch)
    },
    ping() {
      return { pong: Date.now() }
    },
  })

  ipc.start().catch((err) => {
    log('error', `ipc failed to start: ${err.message}`)
    process.exit(1)
  })
  ipcRef = ipc
  log('info', 'ipc server ready')

  setInterval(() => {
    try {
      ipc.broadcast({ event: 'state', data: runner.snapshot() })
    } catch {}
  }, 250)

  process.on('SIGINT', () => shutdown())
  process.on('SIGTERM', () => shutdown())

  function shutdown(): void {
    log('info', 'shutting down')
    try {
      ipc.stop()
      runner.shutdown()
    } catch {}
    setTimeout(() => process.exit(0), 300)
  }

  runner.start().catch((err) => {
    log('error', `failed to start bot: ${err.message}`)
    process.exit(1)
  })

  setInterval(() => {}, 1 << 30)
}

function runMock(
  socketPath: string,
  log: (level: LogLevel, msg: string) => void,
  startedAt: number
): void {
  log('warn', 'MOCK MODE: not connecting to any server')

  const state: BotStateSnapshot = {
    connected: true,
    username: 'MineBot(mock)',
    version: '1.21.x',
    mock: true,
    position: { x: 0, y: 64, z: 0 },
    health: 20,
    food: 20,
    saturation: 5,
    target: null,
    moving: false,
    eating: false,
    viewerPort: null,
    viewerUrl: null,
    serverHost: 'mock',
    serverPort: 0,
    uptimeSec: 0,
    deaths: 0,
    lastError: null,
  }

  const ipc = new IpcServer(socketPath, {
    async goto(x, y, z) {
      state.target = { x, y, z }
      state.moving = true
      setTimeout(() => {
        state.position = { x, y, z }
        state.moving = false
        log('info', `mock arrived at ${x}, ${y}, ${z}`)
      }, 1500)
      return { ok: true, arrived: false }
    },
    async stop() {
      state.moving = false
      state.target = null
      return { ok: true }
    },
    status() {
      return state
    },
    async setConfig(patch) {
      if (patch.autoEatStartAtFood !== undefined) state.food = Math.min(state.food, 20)
      return { ok: true }
    },
    ping() {
      return { pong: Date.now() }
    },
  })

  ipc.start().then(
    () => log('info', 'ipc server ready (mock)'),
    (err) => {
      log('error', `ipc failed to start: ${err.message}`)
      process.exit(1)
    }
  )

  setInterval(() => {
    state.uptimeSec = Math.floor((Date.now() - startedAt) / 1000)
    if (state.moving && state.position && state.target) {
      state.position = {
        x: round2(state.position.x + (state.target.x - state.position.x) * 0.3),
        y: round2(state.position.y + (state.target.y - state.position.y) * 0.3),
        z: round2(state.position.z + (state.target.z - state.position.z) * 0.3),
      }
    }
    try {
      ipc.broadcast({ event: 'state', data: state })
    } catch {}
  }, 250)

  process.on('SIGINT', () => {
    ipc.stop()
    process.exit(0)
  })
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

main()
