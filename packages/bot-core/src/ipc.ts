import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'
import type {
  BotStateSnapshot,
  EventPayload,
  MoveOptions,
  RuntimeConfigPatch,
} from './types'

type Json = Record<string, unknown>

interface RequestMsg {
  jsonrpc?: string
  id?: number | string
  method: string
  params?: Json
}

interface NotificationMsg {
  jsonrpc?: string
  method: string
  params?: Json
}

export interface IpcHandlers {
  goto: (x: number, y: number, z: number, opts?: MoveOptions) => Promise<Json>
  stop: () => Promise<Json>
  status: () => BotStateSnapshot
  setConfig: (patch: RuntimeConfigPatch) => Promise<Json>
  ping: () => Json
}

export class IpcServer {
  private server: net.Server | null = null
  private clients = new Set<net.Socket>()
  readonly socketPath: string

  constructor(socketPath: string, private handlers: IpcHandlers) {
    this.socketPath = socketPath
  }

  async start(): Promise<void> {
    const dir = path.dirname(this.socketPath)
    fs.mkdirSync(dir, { recursive: true })
    if (fs.existsSync(this.socketPath)) fs.rmSync(this.socketPath)

    await new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => this.onConnection(socket))
      this.server.on('error', reject)
      this.server.listen(this.socketPath, () => resolve())
    })
  }

  stop(): void {
    for (const c of this.clients) c.destroy()
    this.clients.clear()
    this.server?.close()
    try {
      if (fs.existsSync(this.socketPath)) fs.rmSync(this.socketPath)
    } catch {}
  }

  broadcast(payload: EventPayload): void {
    const line = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: payload }) + '\n'
    for (const c of this.clients) {
      try {
        c.write(line)
      } catch {}
    }
  }

  clientCount(): number {
    return this.clients.size
  }

  private onConnection(socket: net.Socket): void {
    this.clients.add(socket)
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (line) this.handleLine(socket, line)
      }
    })
    socket.on('error', () => {})
    socket.on('close', () => this.clients.delete(socket))
  }

  private handleLine(socket: net.Socket, line: string): void {
    let msg: RequestMsg | NotificationMsg
    try {
      msg = JSON.parse(line)
    } catch {
      return
    }
    if (!msg || typeof msg.method !== 'string') return

    const isRequest = 'id' in msg && msg.id !== undefined
    const params = (msg.params || {}) as Json

    Promise.resolve()
      .then(() => this.dispatch(msg.method, params))
      .then(
        (result) => {
          if (isRequest) {
            this.write(socket, { jsonrpc: '2.0', id: (msg as RequestMsg).id, result })
          }
        },
        (err: Error) => {
          if (isRequest) {
            this.write(socket, {
              jsonrpc: '2.0',
              id: (msg as RequestMsg).id,
              error: { code: -32000, message: String(err.message || err) },
            })
          }
        }
      )
  }

  private write(socket: net.Socket, obj: unknown): void {
    try {
      socket.write(JSON.stringify(obj) + '\n')
    } catch {}
  }

  private dispatch(method: string, p: Json): Promise<Json> | Json {
    switch (method) {
      case 'ping':
        return this.handlers.ping()
      case 'status':
        return this.handlers.status() as unknown as Json
      case 'goto': {
        const x = Number(p.x)
        const y = Number(p.y)
        const z = Number(p.z)
        if ([x, y, z].some((v) => !Number.isFinite(v))) throw new Error('invalid coordinates')
        const opts: MoveOptions = {}
        if (p.timeoutMs !== undefined) opts.timeoutMs = Number(p.timeoutMs)
        if (p.range !== undefined) opts.range = Number(p.range)
        return this.handlers.goto(x, y, z, opts) as Promise<Json>
      }
      case 'stop':
        return this.handlers.stop() as Promise<Json>
      case 'set_config':
        return this.handlers.setConfig(p as RuntimeConfigPatch) as Promise<Json>
      default:
        throw new Error(`unknown method: ${method}`)
    }
  }
}
