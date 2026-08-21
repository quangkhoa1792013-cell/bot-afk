export interface Position {
  x: number
  y: number
  z: number
}

export interface BotStateSnapshot {
  connected: boolean
  username: string
  version: string
  mock: boolean
  position: Position | null
  health: number
  food: number
  saturation: number
  target: Position | null
  moving: boolean
  eating: boolean
  viewerPort: number | null
  viewerUrl: string | null
  serverHost: string
  serverPort: number
  uptimeSec: number
  deaths: number
  lastError: string | null
}

export interface LogPayload {
  level: 'info' | 'warn' | 'error' | 'debug'
  msg: string
}

export type EventName = 'state' | 'log' | 'spawn' | 'death' | 'end'

export interface EventPayload {
  event: EventName
  data: unknown
}

export interface MoveOptions {
  timeoutMs?: number
  range?: number
}

export interface RuntimeConfigPatch {
  autoEatStartAtFood?: number
  autoEatLowHealth?: number
  canDig?: boolean
  allowParkour?: boolean
  sprint?: boolean
  bannedFoodExtra?: string[]
}
